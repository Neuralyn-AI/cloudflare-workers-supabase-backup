export type RunRequest = {
  databaseUrl: string;
  r2: {
    accountId: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    objectKey: string;
  };
  timeoutMs: number;
};

export type RunStage = "spawn" | "dump" | "upload" | "timeout";

export type RunResponseSuccess = {
  ok: true;
  bytes: number;
  durationMs: number;
  objectKey: string;
  pgDumpVersion: string;
  partsUploaded: number;
};

export type RunResponseFailure = {
  ok: false;
  stage: RunStage;
  message: string;
  exitCode?: number;
  stderrTail?: string;
};

export type RunResponse = RunResponseSuccess | RunResponseFailure;
