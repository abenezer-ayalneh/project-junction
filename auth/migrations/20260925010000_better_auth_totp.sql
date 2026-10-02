create schema if not exists "junction_auth";

alter table "junction_auth"."user" add column "twoFactorEnabled" boolean default false;

create table "junction_auth"."twoFactor" ("id" text not null primary key, "secret" text not null, "backupCodes" text not null, "userId" text not null references "junction_auth"."user" ("id") on delete cascade, "verified" boolean, "failedVerificationCount" integer, "lockedUntil" timestamptz);

create index "twoFactor_secret_idx" on "junction_auth"."twoFactor" ("secret");

create index "twoFactor_userId_idx" on "junction_auth"."twoFactor" ("userId");