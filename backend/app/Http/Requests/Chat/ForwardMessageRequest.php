<?php

namespace App\Http\Requests\Chat;

use Illuminate\Foundation\Http\FormRequest;

class ForwardMessageRequest extends FormRequest
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
            'target_conversation_id' => 'required|integer|exists:conversations,id',
            'body' => 'nullable|string|max:5000',
            'comment' => 'nullable|string|max:5000',
            'metadata' => 'nullable|array',
            'client_uid' => 'nullable|uuid',
        ];
    }

    protected function prepareForValidation(): void
    {
        $body = $this->input('body');
        $comment = $this->input('comment');

        if (($body === null || trim((string) $body) === '') && $comment !== null && trim((string) $comment) !== '') {
            $this->merge([
                'body' => trim((string) $comment),
            ]);
        }
    }
}
