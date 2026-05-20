import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";

export type R2Config = {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  objectKey: string;
};

export type UploadResult = {
  partsUploaded: number;
  bytes: number;
};

export type StreamProducer = (
  push: (chunk: Buffer) => Promise<void>
) => Promise<void>;

type Options = {
  client?: S3Client;
  partSize?: number;
};

const DEFAULT_PART_SIZE = 16 * 1024 * 1024;

export async function streamToR2(
  config: R2Config,
  produce: StreamProducer,
  opts: Options = {}
): Promise<UploadResult> {
  const client =
    opts.client ??
    new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });

  const partSize = opts.partSize ?? DEFAULT_PART_SIZE;

  const init = await client.send(
    new CreateMultipartUploadCommand({
      Bucket: config.bucket,
      Key: config.objectKey,
      ContentType: "application/octet-stream",
    })
  );
  const uploadId = init.UploadId!;
  const parts: { PartNumber: number; ETag: string }[] = [];
  let buffer: Buffer[] = [];
  let buffered = 0;
  let partNumber = 1;
  let totalBytes = 0;

  const flush = async (final: boolean) => {
    if (buffered === 0) return;
    if (!final && buffered < partSize) return;
    const body = Buffer.concat(buffer, buffered);
    buffer = [];
    buffered = 0;
    const res = await client.send(
      new UploadPartCommand({
        Bucket: config.bucket,
        Key: config.objectKey,
        UploadId: uploadId,
        PartNumber: partNumber,
        Body: body,
      })
    );
    parts.push({ PartNumber: partNumber, ETag: res.ETag! });
    partNumber += 1;
  };

  try {
    await produce(async (chunk) => {
      buffer.push(chunk);
      buffered += chunk.length;
      totalBytes += chunk.length;
      await flush(false);
    });
    await flush(true);

    await client.send(
      new CompleteMultipartUploadCommand({
        Bucket: config.bucket,
        Key: config.objectKey,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts },
      })
    );

    return { partsUploaded: parts.length, bytes: totalBytes };
  } catch (err) {
    await client
      .send(
        new AbortMultipartUploadCommand({
          Bucket: config.bucket,
          Key: config.objectKey,
          UploadId: uploadId,
        })
      )
      .catch(() => {});
    throw err;
  }
}
