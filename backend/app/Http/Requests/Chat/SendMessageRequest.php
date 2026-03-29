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
            'message_type' => 'required|in:text,image,file,voice',
            'body' => 'nullable|string',
            'metadata' => 'nullable|array',
            'reply_to_message_id' => 'nullable|integer|exists:messages,id',
            'client_uid' => 'nullable|uuid',
            'attachments' => 'nullable|array|max:10',
            'attachments.*.upload_token' => 'required_with:attachments|string',
        ];
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator) {
            $body = trim((string) $this->input('body', ''));
            $attachments = $this->input('attachments', []);
            $messageType = (string) $this->input('message_type', 'text');

            if ($messageType === 'system') {
                $validator->errors()->add('message_type', 'System message type is reserved for server-generated events.');
            }

            if ($body === '' && empty($attachments)) {
                $validator->errors()->add('body', 'Message body or attachment is required.');
            }
        });
    }
}
