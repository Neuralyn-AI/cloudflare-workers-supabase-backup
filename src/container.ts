import { Container } from "@cloudflare/containers";

export class BackupContainer extends Container {
  defaultPort = 8080;
  sleepAfter = "5m";
}
