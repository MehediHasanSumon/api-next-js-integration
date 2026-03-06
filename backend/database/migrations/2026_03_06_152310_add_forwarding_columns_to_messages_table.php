<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('messages', function (Blueprint $table) {
            $table->foreignId('forwarded_from_message_id')
                ->nullable()
                ->after('reply_to_message_id')
                ->constrained('messages')
                ->nullOnDelete();

            $table->foreignId('forwarded_from_user_id')
                ->nullable()
                ->after('forwarded_from_message_id')
                ->constrained('users')
                ->nullOnDelete();

            $table->json('forwarded_snapshot')
                ->nullable()
                ->after('forwarded_from_user_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('messages', function (Blueprint $table) {
            $table->dropForeign(['forwarded_from_message_id']);
            $table->dropForeign(['forwarded_from_user_id']);
            $table->dropColumn([
                'forwarded_from_message_id',
                'forwarded_from_user_id',
                'forwarded_snapshot',
            ]);
        });
    }
};
