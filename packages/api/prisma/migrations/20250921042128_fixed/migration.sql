/*
  Warnings:

  - You are about to drop the column `google_refres_token` on the `user` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."user" DROP COLUMN "google_refres_token",
ADD COLUMN     "google_refresh_token" TEXT;
