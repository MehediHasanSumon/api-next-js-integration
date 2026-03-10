<?php

namespace App\Http\Requests\Chat;

use Illuminate\Foundation\Http\FormRequest;

class UpdateMessageRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'body' => 'required|string|max:5000',
        ];
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator) {
            $body = trim((string) $this->input('body', ''));

            if ($body === '') {
                $validator->errors()->add('body', 'Message body is required.');
            }
        });
    }
}
