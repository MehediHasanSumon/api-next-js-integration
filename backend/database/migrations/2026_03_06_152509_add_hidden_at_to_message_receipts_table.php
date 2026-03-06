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
        Schema::table('message_receipts', function (Blueprint $table) {
            $table->timestamp('hidden_at')->nullable()->after('seen_at');
            $table->index(['user_id', 'hidden_at'], 'message_receipts_user_hidden_at_idx');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('message_receipts', function (Blueprint $table) {
            $table->dropIndex('message_receipts_user_hidden_at_idx');
            $table->dropColumn('hidden_at');
        });
    }
};
