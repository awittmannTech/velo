import { buildEml, sanitizeFilename, emlFilename, base64UrlToBytes } from "./emlBuilder";
import type { DbMessage } from "@/services/db/messages";

function makeMessage(overrides: Partial<DbMessage> = {}): DbMessage {
  return {
    id: "msg-1",
    account_id: "acc-1",
    thread_id: "thr-1",
    from_address: "alice@example.com",
    from_name: "Alice",
    to_addresses: "bob@example.com",
    cc_addresses: null,
    bcc_addresses: null,
    reply_to: null,
    subject: "Hello",
    snippet: "Hi there",
    date: Date.UTC(2024, 0, 15, 12, 30, 45),
    is_read: 1,
    is_starred: 0,
    body_html: null,
    body_text: null,
    body_cached: 1,
    raw_size: null,
    internal_date: null,
    list_unsubscribe: null,
    list_unsubscribe_post: null,
    auth_results: null,
    message_id_header: null,
    references_header: null,
    in_reply_to_header: null,
    imap_uid: null,
    imap_folder: null,
    ...overrides,
  };
}

describe("buildEml", () => {
  it("produces CRLF line endings and core headers", () => {
    const eml = buildEml(makeMessage({ body_text: "Plain body" }));
    expect(eml).toContain("\r\n");
    expect(eml).toContain("From: Alice <alice@example.com>");
    expect(eml).toContain("To: bob@example.com");
    expect(eml).toContain("Subject: Hello");
    expect(eml).toContain("Date: ");
    expect(eml).toContain("MIME-Version: 1.0");
  });

  it("falls back to the internal id for Message-ID and wraps it in angle brackets", () => {
    const eml = buildEml(makeMessage({ id: "abc123", body_text: "x" }));
    expect(eml).toContain("Message-ID: <abc123>");
  });

  it("does not double-wrap an existing angle-bracketed Message-ID header", () => {
    const eml = buildEml(makeMessage({ message_id_header: "<real@id>", body_text: "x" }));
    expect(eml).toContain("Message-ID: <real@id>");
    expect(eml).not.toContain("<<real@id>>");
  });

  it("emits a single text/plain part when only body_text is present", () => {
    const eml = buildEml(makeMessage({ body_text: "Just text" }));
    expect(eml).toContain("Content-Type: text/plain; charset=UTF-8");
    expect(eml).toContain("Just text");
    expect(eml).not.toContain("multipart/alternative");
  });

  it("prefers text/html when only body_html is present", () => {
    const eml = buildEml(makeMessage({ body_html: "<p>Hi</p>" }));
    expect(eml).toContain("Content-Type: text/html; charset=UTF-8");
    expect(eml).toContain("<p>Hi</p>");
  });

  it("builds multipart/alternative with both parts when text and html exist", () => {
    const eml = buildEml(
      makeMessage({ body_text: "Plain", body_html: "<p>Rich</p>" }),
      { boundary: "BOUND" },
    );
    expect(eml).toContain('Content-Type: multipart/alternative; boundary="BOUND"');
    expect(eml).toContain("--BOUND\r\nContent-Type: text/plain");
    expect(eml).toContain("--BOUND\r\nContent-Type: text/html");
    expect(eml).toContain("--BOUND--");
    expect(eml).toContain("Plain");
    expect(eml).toContain("<p>Rich</p>");
  });

  it("includes Cc, Bcc, Reply-To, In-Reply-To and References when present", () => {
    const eml = buildEml(
      makeMessage({
        body_text: "x",
        cc_addresses: "carol@example.com",
        bcc_addresses: "dan@example.com",
        reply_to: "noreply@example.com",
        in_reply_to_header: "parent@id",
        references_header: "<a@id> <b@id>",
      }),
    );
    expect(eml).toContain("Cc: carol@example.com");
    expect(eml).toContain("Bcc: dan@example.com");
    expect(eml).toContain("Reply-To: noreply@example.com");
    expect(eml).toContain("In-Reply-To: <parent@id>");
    expect(eml).toContain("References: <a@id> <b@id>");
  });
});

describe("sanitizeFilename", () => {
  it("replaces unsafe characters with underscores", () => {
    expect(sanitizeFilename("Re: Hello / World!")).toBe("Re_Hello_World");
  });

  it("collapses repeated separators and trims edges", () => {
    expect(sanitizeFilename("  ***weird***  ")).toBe("weird");
  });

  it("caps length", () => {
    expect(sanitizeFilename("a".repeat(200), 10)).toHaveLength(10);
  });

  it("returns a fallback for empty/garbage input", () => {
    expect(sanitizeFilename("///")).toBe("email");
    expect(sanitizeFilename("")).toBe("email");
  });
});

describe("emlFilename", () => {
  it("produces a sortable, sanitized, .eml-suffixed name", () => {
    const name = emlFilename(makeMessage({ subject: "Re: Lunch?", id: "xYz" }));
    expect(name).toBe("20240115-123045_Re_Lunch_xYz.eml");
  });

  it("handles a missing subject", () => {
    const name = emlFilename(makeMessage({ subject: null }));
    expect(name).toContain("no-subject");
    expect(name.endsWith(".eml")).toBe(true);
  });
});

describe("base64UrlToBytes", () => {
  it("decodes a url-safe base64 string without padding", () => {
    // "Hello" => base64 "SGVsbG8="; url-safe without padding "SGVsbG8"
    const bytes = base64UrlToBytes("SGVsbG8");
    expect(new TextDecoder().decode(bytes)).toBe("Hello");
  });

  it("decodes url-safe alphabet (- and _)", () => {
    // bytes [0xfb, 0xff] => standard base64 "+/8=" => url-safe "-_8"
    const bytes = base64UrlToBytes("-_8");
    expect(Array.from(bytes)).toEqual([0xfb, 0xff]);
  });
});
