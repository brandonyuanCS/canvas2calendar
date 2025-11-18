-- AlterTable
ALTER TABLE "public"."calendar_event" ADD COLUMN     "course_code" TEXT;

-- CreateIndex
CREATE INDEX "calendar_event_course_code_idx" ON "public"."calendar_event"("course_code");
