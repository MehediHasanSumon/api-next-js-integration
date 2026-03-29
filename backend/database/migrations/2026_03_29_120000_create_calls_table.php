<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('calls', function (Blueprint $table) {
            $table->id();
            $table->foreignId('conversation_id')->constrained('conversations')->cascadeOnDelete();
            $table->foreignId('caller_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('receiver_id')->nullable()->constrained('users')->nullOnDelete();
            $table->enum('call_type', ['audio', 'video']);
            $table->enum('status', ['initiated', 'ringing', 'accepted', 'declined', 'ended', 'missed', 'failed'])
                ->default('initiated');
            $table->timestamp('started_at')->nullable();
            $table->timestamp('answered_at')->nullable();
            $table->timestamp('ended_at')->nullable();
            $table->unsignedInteger('duration_seconds')->nullable();
            $table->string('end_reason', 100)->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->index(['conversation_id', 'status', 'created_at'], 'calls_conversation_status_created_idx');
            $table->index(['caller_id', 'status', 'created_at'], 'calls_caller_status_created_idx');
            $table->index(['receiver_id', 'status', 'created_at'], 'calls_receiver_status_created_idx');
            $table->index(['conversation_id', 'call_type'], 'calls_conversation_type_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('calls');
    }
};
