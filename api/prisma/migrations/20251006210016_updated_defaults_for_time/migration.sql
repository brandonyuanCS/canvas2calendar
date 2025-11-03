/*
  Warnings:

  - Added the required column `updated_at` to the `calendar` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `task_list` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."calendar" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "public"."task_list" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
