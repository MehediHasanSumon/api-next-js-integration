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
        Schema::table('users', function (Blueprint $table) {
            $table->timestamp('last_seen_at')->nullable()->after('email_verified_at');
            $table->timestamp('last_active_at')->nullable()->after('last_seen_at');

            $table->index('last_seen_at', 'users_last_seen_at_idx');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex('users_last_seen_at_idx');
            $table->dropColumn(['last_seen_at', 'last_active_at']);
        });
    }
};
