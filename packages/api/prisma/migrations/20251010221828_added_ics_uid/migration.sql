/*
  Warnings:

  - A unique constraint covering the columns `[ics_uid]` on the table `calendar_event` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[ics_uid]` on the table `task` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "public"."calendar_event" ADD COLUMN     "ics_uid" TEXT NOT NULL DEFAULT 'unknown';

-- AlterTable
ALTER TABLE "public"."task" ADD COLUMN     "ics_uid" TEXT NOT NULL DEFAULT 'unknown';

-- CreateIndex
CREATE UNIQUE INDEX "calendar_event_ics_uid_key" ON "public"."calendar_event"("ics_uid");

-- CreateIndex
CREATE INDEX "calendar_event_ics_uid_idx" ON "public"."calendar_event"("ics_uid");

-- CreateIndex
CREATE UNIQUE INDEX "task_ics_uid_key" ON "public"."task"("ics_uid");

-- CreateIndex
CREATE INDEX "task_ics_uid_idx" ON "public"."task"("ics_uid");
