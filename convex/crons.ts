import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("ingest feeds", { hours: 2 }, internal.ingest.run, {});
crons.cron("morning build", "5 13,14,15,16 * * *", internal.pipeline.morningBuild, {});

export default crons;
