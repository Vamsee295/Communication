import { defineEventHandler, getRequestURL, fromWebHandler } from "h3";
import { handleAttachmentApiRequest } from "@/lib/attachments.api";

export default defineEventHandler(async (event) => {
  const req = event.node.req;
  const res = event.node.res;
  
  // Convert standard Node incoming request to Web Request for handleAttachmentApiRequest
  const url = getRequestURL(event);
  
  // Read body if PUT/POST
  let body: Buffer | undefined;
  if (req.method === "PUT" || req.method === "POST" || req.method === "PATCH") {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    body = Buffer.concat(chunks);
  }

  const webRequest = new Request(url.href, {
    method: req.method,
    headers: req.headers as HeadersInit,
    body: body ? body : undefined,
    // @ts-ignore
    duplex: "half",
  });

  const webResponse = await handleAttachmentApiRequest(webRequest);

  res.statusCode = webResponse.status;
  webResponse.headers.forEach((val, key) => {
    res.setHeader(key, val);
  });

  if (webResponse.body) {
    const arrayBuffer = await webResponse.arrayBuffer();
    res.end(Buffer.from(arrayBuffer));
  } else {
    res.end();
  }
});
