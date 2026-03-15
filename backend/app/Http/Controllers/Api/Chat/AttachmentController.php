<?php

namespace App\Http\Controllers\Api\Chat;

use App\Http\Controllers\Controller;
use App\Models\Conversation;
use App\Services\Chat\ConversationAccessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AttachmentController extends Controller
{
    private const MAX_UPLOAD_SIZE_KB = 10240; // 10 MB
    private const ALLOWED_MIME_TYPES = [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
        'audio/mpeg',
        'audio/wav',
        'audio/webm',
        'audio/x-webm',
        'audio/ogg',
        'audio/mp4',
        'video/webm',
        'application/pdf',
        'text/plain',
        'application/zip',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    private const ALLOWED_EXTENSIONS = [
        'jpeg',
        'jpg',
        'png',
        'webp',
        'gif',
        'mp3',
        'wav',
        'webm',
        'ogg',
        'm4a',
        'pdf',
        'txt',
        'zip',
        'docx',
        'xlsx',
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

        $isAllowedMime = in_array($mimeType, self::ALLOWED_MIME_TYPES, true);
        $isAllowedExtension = $extension !== null && in_array($extension, self::ALLOWED_EXTENSIONS, true);

        if (!$isAllowedMime && !$isAllowedExtension) {
            throw ValidationException::withMessages([
                'file' => ['The file field must be a file of type: ' . implode(', ', self::ALLOWED_MIME_TYPES) . '.'],
            ]);
        }

        $storageDisk = 'public';
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
}
