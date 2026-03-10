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
        'application/pdf',
        'text/plain',
        'application/zip',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];

    public function store(Request $request, ConversationAccessService $accessService): JsonResponse
    {
        $validated = $request->validate([
            'conversation_id' => 'required|integer|exists:conversations,id',
            'file' => [
                'required',
                'file',
                'max:' . self::MAX_UPLOAD_SIZE_KB,
                'mimetypes:' . implode(',', self::ALLOWED_MIME_TYPES),
            ],
        ]);

        $conversation = Conversation::query()->findOrFail((int) $validated['conversation_id']);
        $accessService->requireAcceptedParticipant($conversation, $request->user());

        /** @var \Illuminate\Http\UploadedFile $file */
        $file = $validated['file'];
        $storageDisk = 'public';
        $storagePath = $file->store('chat/uploads', $storageDisk);
        $mimeType = (string) ($file->getMimeType() ?? 'application/octet-stream');
        $extension = $file->getClientOriginalExtension() ?: null;
        $isImage = str_starts_with($mimeType, 'image/');
        $checksum = null;

        $width = null;
        $height = null;

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
                'attachment_type' => $isImage ? 'image' : 'file',
                'storage_disk' => $storageDisk,
                'storage_path' => $storagePath,
                'original_name' => $file->getClientOriginalName(),
                'mime_type' => $mimeType,
                'extension' => $extension,
                'size_bytes' => $file->getSize() ?? 0,
                'width' => $width,
                'height' => $height,
                'checksum_sha256' => $checksum,
            ],
        ]);
    }
}
