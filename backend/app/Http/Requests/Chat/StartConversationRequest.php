<?php

namespace App\Http\Requests\Chat;

use Illuminate\Foundation\Http\FormRequest;

class StartConversationRequest extends FormRequest
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
            'recipient_user_id' => 'nullable|integer|exists:users,id|required_without_all:recipient_email,participant_ids',
            'recipient_email' => 'nullable|email|exists:users,email|required_without_all:recipient_user_id,participant_ids',
            'participant_ids' => 'nullable|array|min:1|required_without_all:recipient_user_id,recipient_email',
            'participant_ids.*' => 'integer|distinct|exists:users,id',
            'title' => 'nullable|string|max:255',
        ];
    }
}
