<?php

namespace App\Http\Controllers\Api\Chat;

use App\Http\Controllers\Controller;
use App\Models\Conversation;
use App\Models\MessageAttachment;
use App\Services\Chat\ConversationAccessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AttachmentController extends Controller
{
    private const MAX_UPLOAD_SIZE_KB = 10240; // 10 MB
    private const ALLOWED_MIME_EXTENSIONS = [
        'image/jpeg' => ['jpeg', 'jpg'],
        'image/png' => ['png'],
        'image/webp' => ['webp'],
        'image/gif' => ['gif'],
        'audio/mpeg' => ['mp3'],
        'audio/wav' => ['wav'],
        'audio/webm' => ['webm'],
        'audio/x-webm' => ['webm'],
        'audio/ogg' => ['ogg'],
        'audio/mp4' => ['m4a'],
        'video/webm' => ['webm'],
        'application/pdf' => ['pdf'],
        'text/plain' => ['txt'],
        'application/zip' => ['zip'],
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => ['docx'],
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => ['xlsx'],
    ];

    public function store(Request $request, ConversationAccessService $accessService): JsonResponse
    {
        $validated = $request->validate([
            'conversation_id' => 'required|integer|exists:conversations,id',
            'duration_ms' => 'nullable|integer|min:0|max:3600000',
            'file' => [
                'required',
                'file',
                'max:' . self::MAX_UPLOAD_SIZE_KB,
            ],
        ]);

        $conversation = Conversation::query()->findOrFail((int) $validated['conversation_id']);
        $accessService->requireAcceptedParticipant($conversation, $request->user());

        /** @var \Illuminate\Http\UploadedFile $file */
        $file = $validated['file'];
        $mimeType = (string) ($file->getMimeType() ?? 'application/octet-stream');
        $extensionRaw = $file->getClientOriginalExtension();
        $extension = $extensionRaw !== '' ? strtolower($extensionRaw) : null;

        $allowedExtensions = self::ALLOWED_MIME_EXTENSIONS[$mimeType] ?? null;
        $isAllowedMime = is_array($allowedExtensions);
        $isAllowedExtension = $extension !== null && $allowedExtensions !== null && in_array($extension, $allowedExtensions, true);

        if (!$isAllowedMime || !$isAllowedExtension) {
            throw ValidationException::withMessages([
                'file' => ['The uploaded file type is not allowed or does not match its file extension.'],
            ]);
        }

        $storageDisk = 'private';
        $storagePath = $file->store('chat/uploads', $storageDisk);
        $isImage = str_starts_with($mimeType, 'image/');
        $isAudio = str_starts_with($mimeType, 'audio/');
        $attachmentType = $isImage ? 'image' : ($isAudio ? 'voice' : 'file');
        $checksum = null;

        $width = null;
        $height = null;
        $durationMs = array_key_exists('duration_ms', $validated) ? $validated['duration_ms'] : null;

        $realPath = $file->getRealPath();
        if (is_string($realPath) && $realPath !== '') {
            $checksum = hash_file('sha256', $realPath) ?: null;
        }

        if ($isImage) {
            $imageInfo = @getimagesize($file->getRealPath());
            if (is_array($imageInfo)) {
                $width = $imageInfo[0] ?? null;
                $height = $imageInfo[1] ?? null;
            }
        }

        return response()->json([
            'message' => 'Attachment uploaded successfully.',
            'data' => [
                'upload_token' => Crypt::encryptString(json_encode([
                    'conversation_id' => (int) $conversation->id,
                    'uploader_id' => (int) $request->user()->id,
                    'attachment_type' => $attachmentType,
                    'storage_disk' => $storageDisk,
                    'storage_path' => $storagePath,
                    'original_name' => $file->getClientOriginalName(),
                    'mime_type' => $mimeType,
                    'extension' => $extension,
                    'size_bytes' => (int) ($file->getSize() ?? 0),
                    'width' => $width,
                    'height' => $height,
                    'duration_ms' => $durationMs,
                    'checksum_sha256' => $checksum,
                    'issued_at' => now()->toISOString(),
                    'expires_at' => now()->addMinutes(30)->toISOString(),
                ], JSON_THROW_ON_ERROR)),
                'attachment_type' => $attachmentType,
                'storage_disk' => $storageDisk,
                'storage_path' => $storagePath,
                'original_name' => $file->getClientOriginalName(),
                'mime_type' => $mimeType,
                'extension' => $extension,
                'size_bytes' => $file->getSize() ?? 0,
                'width' => $width,
                'height' => $height,
                'duration_ms' => $durationMs,
                'checksum_sha256' => $checksum,
            ],
        ]);
    }

    public function show(
        Request $request,
        MessageAttachment $attachment,
        ConversationAccessService $accessService
    ): StreamedResponse {
        $message = $attachment->message()->with('conversation')->firstOrFail();
        $conversation = $message->conversation;

        $accessService->requireVisibleParticipant($conversation, $request->user());

        $diskName = $attachment->storage_disk ?: 'private';
        $disk = Storage::disk($diskName);

        if (!$disk->exists($attachment->storage_path)) {
            abort(404, 'Attachment file not found.');
        }

        $headers = [];
        if ($attachment->mime_type) {
            $headers['Content-Type'] = $attachment->mime_type;
        }

        if ($request->boolean('download')) {
            return $disk->download(
                $attachment->storage_path,
                $attachment->original_name ?: basename($attachment->storage_path),
                $headers
            );
        }

        return $disk->response(
            $attachment->storage_path,
            $attachment->original_name ?: basename($attachment->storage_path),
            $headers
        );
    }
}
