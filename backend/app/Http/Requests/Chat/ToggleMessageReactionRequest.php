<?php

namespace App\Http\Requests\Chat;

use Illuminate\Foundation\Http\FormRequest;

class ToggleMessageReactionRequest extends FormRequest
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
            'emoji' => 'required|string|max:32',
        ];
    }

    protected function prepareForValidation(): void
    {
        if ($this->has('emoji')) {
            $this->merge([
                'emoji' => trim((string) $this->input('emoji')),
            ]);
        }
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator): void {
            $emoji = (string) $this->input('emoji', '');

            if ($emoji === '') {
                $validator->errors()->add('emoji', 'Emoji is required.');
                return;
            }

            $hasEmojiLikeCodepoint = (bool) preg_match('/[\x{00A9}\x{00AE}\x{203C}-\x{3299}\x{1F000}-\x{1FAFF}]/u', $emoji);
            if (!$hasEmojiLikeCodepoint) {
                $validator->errors()->add('emoji', 'The emoji field must contain a valid emoji.');
            }
        });
    }
}
