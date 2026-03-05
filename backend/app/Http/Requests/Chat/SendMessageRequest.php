<?php

namespace App\Http\Requests\Chat;

use Illuminate\Foundation\Http\FormRequest;

class SendMessageRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, \Illuminate\Contracts\Validation\ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'message_type' => 'required|in:text,image,file,voice,system',
            'body' => 'nullable|string',
            'metadata' => 'nullable|array',
            'reply_to_message_id' => 'nullable|integer|exists:messages,id',
            'client_uid' => 'nullable|uuid',
            'attachments' => 'nullable|array|max:10',
            'attachments.*.attachment_type' => 'required_with:attachments|in:image,file,voice',
            'attachments.*.storage_disk' => 'nullable|string|max:50',
            'attachments.*.storage_path' => 'required_with:attachments|string|max:1024',
            'attachments.*.original_name' => 'nullable|string|max:255',
            'attachments.*.mime_type' => 'required_with:attachments|string|max:191',
            'attachments.*.extension' => 'nullable|string|max:20',
            'attachments.*.size_bytes' => 'required_with:attachments|integer|min:1',
            'attachments.*.width' => 'nullable|integer|min:0',
            'attachments.*.height' => 'nullable|integer|min:0',
            'attachments.*.duration_ms' => 'nullable|integer|min:0',
            'attachments.*.checksum_sha256' => 'nullable|string|size:64',
            'attachments.*.metadata' => 'nullable|array',
        ];
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator) {
            $body = trim((string) $this->input('body', ''));
            $attachments = $this->input('attachments', []);

            if ($body === '' && empty($attachments)) {
                $validator->errors()->add('body', 'Message body or attachment is required.');
            }
        });
    }
}
