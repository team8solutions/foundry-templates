import assert from "node:assert/strict";
import test from "node:test";
import {
  FormRequestError,
  formRedirectLocation,
  isFormContentType,
  isSameOrigin,
  readFormRequest,
  safeMessage,
} from "../../lib/http";

const url = "https://app.example.test/account";
const formHeaders = {
  origin: "https://app.example.test",
  host: "app.example.test",
  "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
};

function request(headers: Record<string, string>) {
  return new Request(url, { method: "POST", headers });
}

function chunkedRequest(chunks: string[], headers = formHeaders) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Request(url, {
    method: "POST",
    headers,
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

async function assertFormError(
  promise: Promise<unknown>,
  status: number,
  message: string,
) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof FormRequestError);
    assert.equal(error.status, status);
    assert.equal(error.message, message);
    return true;
  });
}

test("accepts same-origin URL-encoded form requests", async () => {
  const value = chunkedRequest(["name=Ada", "&email=ada%40example.com"]);
  assert.equal(isSameOrigin(value), true);
  assert.equal(isFormContentType(value), true);
  assert.deepEqual(await readFormRequest(value), {
    name: "Ada",
    email: "ada@example.com",
  });
});

test("rejects cross-origin and unsupported content types", async () => {
  assert.equal(
    isSameOrigin(
      request({ origin: "https://evil.example", host: "app.example.test" }),
    ),
    false,
  );
  assert.equal(isSameOrigin(request({ host: "app.example.test" })), false);
  assert.equal(
    isFormContentType(request({ "content-type": "application/json" })),
    false,
  );
  await assertFormError(
    readFormRequest(
      request({
        ...formHeaders,
        "content-type": "multipart/form-data; boundary=test",
      }),
    ),
    415,
    "Expected URL-encoded form data",
  );
});

test("rejects a chunked form once its streamed bytes exceed the limit", async () => {
  await assertFormError(
    readFormRequest(chunkedRequest(["name=", "1234", "5678"]), 10),
    413,
    "Form data is too large",
  );
});

test("builds application-relative form redirects", () => {
  assert.equal(formRedirectLocation("/dashboard"), "/dashboard");
  assert.equal(
    formRedirectLocation("/sign-in", { error: "Sign in again" }),
    "/sign-in?error=Sign+in+again",
  );
  assert.throws(
    () => formRedirectLocation("https://evil.example"),
    /application-relative/,
  );
  assert.throws(() => formRedirectLocation("//evil.example"), /application-relative/);
});

test("bounds messages rendered from query parameters", () => {
  assert.equal(safeMessage("x".repeat(200)).length, 160);
  assert.equal(safeMessage(null), "");
});
