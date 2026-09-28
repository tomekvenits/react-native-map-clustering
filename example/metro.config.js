const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const libraryRoot = path.resolve(__dirname, "..");
const config = getDefaultConfig(__dirname);

config.watchFolders = [libraryRoot];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules")];

module.exports = config;
