const { defineConfig, env } = require("@prisma/config");

module.exports = defineConfig({
  schema: "./prisma/schema.prisma",
  engine: "classic",
  datasource: {
    url:       env("DATABASE_URL"),
    directUrl: env("DIRECT_URL"),
  },
});
