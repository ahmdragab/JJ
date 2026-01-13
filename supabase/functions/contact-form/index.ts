import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createLogger } from "../_shared/logger.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const CONTACT_EMAIL = "support@alwan.studio";

function getCors(request: Request): Record<string, string> {
  return {
    ...getCorsHeaders(request),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

interface ContactFormData {
  name: string;
  email: string;
  subject: string;
  message: string;
}

Deno.serve(async (req: Request) => {
  const logger = createLogger("contact-form");
  const requestId = logger.generateRequestId();

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: getCors(req),
    });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...getCors(req), "Content-Type": "application/json" } }
    );
  }

  try {
    logger.setContext({ request_id: requestId });

    const { name, email, subject, message }: ContactFormData = await req.json();

    if (!name || !email || !subject || !message) {
      return new Response(
        JSON.stringify({ error: "All fields are required" }),
        { status: 400, headers: { ...getCors(req), "Content-Type": "application/json" } }
      );
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: "Invalid email address" }),
        { status: 400, headers: { ...getCors(req), "Content-Type": "application/json" } }
      );
    }

    logger.info("Processing contact form submission", {
      subject,
      sender_email: email
    });

    if (!RESEND_API_KEY) {
      logger.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { ...getCors(req), "Content-Type": "application/json" } }
      );
    }

    // Send email via Resend
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Alwan Studio <noreply@alwan.studio>",
        to: [CONTACT_EMAIL],
        reply_to: email,
        subject: `[Contact] ${subject} - ${name}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #3531B7;">New Contact Form Submission</h2>
            <p><strong>From:</strong> ${escapeHtml(name)} (${escapeHtml(email)})</p>
            <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
            <div style="white-space: pre-wrap;">${escapeHtml(message)}</div>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
            <p style="color: #6b7280; font-size: 12px;">
              This message was sent via the Alwan Studio contact form.
            </p>
          </div>
        `,
        text: `New Contact Form Submission\n\nFrom: ${name} (${email})\nSubject: ${subject}\n\n${message}`,
      }),
    });

    if (!resendResponse.ok) {
      const errorData = await resendResponse.text();
      logger.error("Failed to send email via Resend", {
        status: resendResponse.status,
        error: errorData
      });
      return new Response(
        JSON.stringify({ error: "Failed to send email" }),
        { status: 500, headers: { ...getCors(req), "Content-Type": "application/json" } }
      );
    }

    logger.info("Contact form email sent successfully", { subject });

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...getCors(req), "Content-Type": "application/json" } }
    );
  } catch (error) {
    logger.error("Contact form error", { error: String(error) });
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...getCors(req), "Content-Type": "application/json" } }
    );
  }
});

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
