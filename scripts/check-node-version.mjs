const REQUIRED_MAJOR = 22;
const currentMajor = Number(process.versions.node.split(".")[0]);

if (currentMajor !== REQUIRED_MAJOR) {
  console.error(
    `[Node version mismatch] GymBroSar requires Node ${REQUIRED_MAJOR}.x LTS. Current: ${process.version}. Run: nvm use ${REQUIRED_MAJOR}`
  );
  process.exit(1);
}
