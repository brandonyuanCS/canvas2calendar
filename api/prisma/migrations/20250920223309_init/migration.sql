-- CreateTable
CREATE TABLE "public"."user" (
    "id" SERIAL NOT NULL,
    "google_user_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "google_access_token" TEXT,
    "google_refres_token" TEXT,
    "google_token_expires_at" TIMESTAMP(3),
    "preferences" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."calendar" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "google_calendar_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."task_list" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "google_task_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_list_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_google_user_id_key" ON "public"."user"("google_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_google_calendar_id_key" ON "public"."calendar"("google_calendar_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_list_google_task_id_key" ON "public"."task_list"("google_task_id");

-- AddForeignKey
ALTER TABLE "public"."calendar" ADD CONSTRAINT "calendar_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."task_list" ADD CONSTRAINT "task_list_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
