const { parseArgs } = require("./utils");
const { runClaim } = require("./v2ex-service");

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await runClaim(options);

  console.log(result.message);

  if (result.status === "未登录") {
    process.exitCode = 2;
  } else if (result.status === "异常") {
    process.exitCode = 3;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
