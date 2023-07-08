// @denoify-ignore
import crypto from 'crypto'
import type { Hono } from '../../hono'

import { encodeBase64 } from '../../utils/encode'

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
globalThis.crypto ??= crypto

interface CloudFrontHeader {
  key: string;
  value: string;
}

interface CloudFrontHeaders {
  [name: string]: CloudFrontHeader[];
}

interface CloudFrontCustomOrigin {
  customHeaders: CloudFrontHeaders;
  domainName: string;
  keepaliveTimeout: number;
  path: string;
  port: number;
  protocol: string;
  readTimeout: number;
  sslProtocols: string[];
}

interface CloudFrontRequest {
  clientIp: string;
  headers: CloudFrontHeaders;
  method: string;
  querystring: string;
  uri: string;
  body?: {
    inputTruncated: boolean;
    action: string;
    encoding: string;
    data: string;
  };
  origin?: {
    custom: CloudFrontCustomOrigin;
  };
}

interface CloudFrontConfig {
  distributionDomainName: string;
  distributionId: string;
  eventType: string;
  requestId: string;
}

interface CloudFrontEvent {
  cf: {
    config: CloudFrontConfig;
    request: CloudFrontRequest;
  };
}

interface CloudFrontEdgeEvent {
  Records: CloudFrontEvent[];
}

interface CloudFrontResult {
  status: string;
  statusDescription?: string;
  headers: {
      [header: string]: {
          key?: string;
          value: string;
      }[];
  };
  body?: string;
}

/**
 * Accepts events from 'Lambda@Edge' event
 * https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-event-structure.html
 */
export const handle = (app: Hono) => {
  return async (
    event: CloudFrontEdgeEvent
  ): Promise<CloudFrontResult> => {
    const req = createRequest(event)
    const res = await app.fetch(req)

    return createResult(res)
  }
}

const createResult = async (res: Response): Promise<CloudFrontResult> => {
    const isBase64Encoded = isContentTypeBinary(res.headers.get('content-type') || '')

    const body = isBase64Encoded ? encodeBase64(await res.arrayBuffer()) : await res.text()

    const headers: { [header: string]: { key: string; value: string }[] } = {}

    res.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = [{ key: key.toLowerCase(), value }]
    })

    return {
        status: res.status.toString(),
        headers,
        body,
    }
}

const createRequest = (
  event: CloudFrontEdgeEvent
) => {
  const queryString = extractQueryString(event)
  const urlPath = `https://${event.Records[0].cf.config.distributionDomainName}${event.Records[0].cf.request.uri}`
  const url = queryString ? `${urlPath}?${queryString}` : urlPath

  const headers = new Headers()
  for (const [k, v] of Object.entries(event.Records[0].cf.request.headers)) {
    if (Array.isArray(v)) {
      v.forEach(header => headers.set(k, header.value))
    }
  }
  const method = event.Records[0].cf.request.method 
  const requestInit: RequestInit = {
    headers,
    method,
  }

  const requestBody = event.Records[0].cf.request.body
  requestInit.body = requestBody?.encoding === 'base64' && requestBody?.data
    ? atob(requestBody.data)
    : requestBody?.data
  return new Request(url, requestInit)
}

const extractQueryString = (
  event: CloudFrontEdgeEvent
) => {
  return event.Records[0].cf.request.querystring
}

export const isContentTypeBinary = (contentType: string) => {
  return !/^(text\/(plain|html|css|javascript|csv).*|application\/(.*json|.*xml).*|image\/svg\+xml)$/.test(
    contentType
  )
}