import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
const taskInput = z.object({ taskId: z.string().uuid() });
async function services() {
  const [{ supabaseAdmin }, service] = await Promise.all([
    import("@/integrations/supabase/client.server"),
    import("./application-agent.server"),
  ]);
  return { db: supabaseAdmin as never, service };
}
export const getAgentStateFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db, service } = await services();
    return service.getAgentState(db, context.userId);
  });
export const saveAgentSettingsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        enabled: z.boolean(),
        daily_limit: z.number().int().min(1).max(20),
        min_fit: z.number().int().min(50).max(100),
        include_stretch: z.boolean(),
      })
      .strict()
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("agent_settings")
      .upsert({ ...data, user_id: context.userId, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { saved: true };
  });
export const prepareAgentQueueFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db, service } = await services();
    return service.prepareDailyQueue(db, context.userId, true);
  });
export const prepareApplicationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => taskInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { db, service } = await services();
    await service.prepareApplication(db, context.userId, data.taskId);
    return { prepared: true };
  });
export const saveAnswerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    taskInput
      .extend({
        question: z.string().trim().min(1).max(500),
        answer: z.string().trim().min(1).max(4000),
        remember: z.boolean(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { db, service } = await services();
    return service.saveQuestionAnswer(db, context.userId, data);
  });
export const importQuestionsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    taskInput
      .extend({
        questions: z
          .array(
            z.object({
              key: z.string().max(1000),
              label: z.string().trim().min(1).max(500),
              required: z.boolean(),
              options: z.array(z.string().max(500)).max(300),
              type: z.enum([
                "text",
                "textarea",
                "select",
                "radio",
                "email",
                "tel",
                "url",
                "number",
                "date",
                "checkbox",
                "file",
                "manual",
              ]),
            }),
          )
          .max(100),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { db, service } = await services();
    return service.importApplicationQuestions(db, context.userId, data.taskId, data.questions);
  });
export const downloadPacketFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => taskInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { db, service } = await services();
    return service.downloadApplicationPacket(db, context.userId, data.taskId);
  });
export const setTaskStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    taskInput
      .extend({
        status: z.enum(["submitted", "dismissed"]),
        confirmation: z.string().trim().max(2000).optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { db, service } = await services();
    return service.closeApplicationTask(
      db,
      context.userId,
      data.taskId,
      data.status,
      data.confirmation,
    );
  });
export const deleteMemoryAnswerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("answer_memory")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { deleted: true };
  });
