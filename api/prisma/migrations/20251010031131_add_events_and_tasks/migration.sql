/*
  Warnings:

  - You are about to drop the column `google_task_id` on the `task_list` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[google_task_list_id]` on the table `task_list` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `google_task_list_id` to the `task_list` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "public"."task_list_google_task_id_key";

-- AlterTable
ALTER TABLE "public"."task_list" DROP COLUMN "google_task_id",
ADD COLUMN     "google_task_list_id" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "public"."calendar_event" (
    "id" SERIAL NOT NULL,
    "calendar_id" INTEGER NOT NULL,
    "google_event_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "is_all_day" BOOLEAN NOT NULL DEFAULT false,
    "location" TEXT,
    "event_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."task" (
    "id" SERIAL NOT NULL,
    "task_list_id" INTEGER NOT NULL,
    "google_task_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "due_date" TIMESTAMP(3),
    "task_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "calendar_event_google_event_id_key" ON "public"."calendar_event"("google_event_id");

-- CreateIndex
CREATE INDEX "calendar_event_calendar_id_idx" ON "public"."calendar_event"("calendar_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_google_task_id_key" ON "public"."task"("google_task_id");

-- CreateIndex
CREATE INDEX "task_task_list_id_idx" ON "public"."task"("task_list_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_list_google_task_list_id_key" ON "public"."task_list"("google_task_list_id");

-- AddForeignKey
ALTER TABLE "public"."calendar_event" ADD CONSTRAINT "calendar_event_calendar_id_fkey" FOREIGN KEY ("calendar_id") REFERENCES "public"."calendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."task" ADD CONSTRAINT "task_task_list_id_fkey" FOREIGN KEY ("task_list_id") REFERENCES "public"."task_list"("id") ON DELETE CASCADE ON UPDATE CASCADE;
