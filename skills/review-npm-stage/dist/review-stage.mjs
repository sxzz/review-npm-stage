#!/usr/bin/env node
import process$1, { cwd } from "node:process";
import fs, { access, chmod, constants, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import path, { basename, delimiter, dirname, isAbsolute, join, normalize, parse, relative, resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import fs$1, { closeSync, createReadStream, createWriteStream, openSync, readSync, statSync } from "node:fs";
import os, { homedir, tmpdir } from "node:os";
import childProcess, { execFile, spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { PassThrough, Readable } from "node:stream";
import u from "node:readline";
import { Buffer as Buffer$1 } from "node:buffer";
import { setTimeout as setTimeout$1 } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
//#region node_modules/.pnpm/cac@7.0.0/node_modules/cac/dist/index.js
function toArr(any) {
	return any == null ? [] : Array.isArray(any) ? any : [any];
}
function toVal(out, key, val, opts) {
	var x, old = out[key], nxt = !!~opts.string.indexOf(key) ? val == null || val === true ? "" : String(val) : typeof val === "boolean" ? val : !!~opts.boolean.indexOf(key) ? val === "false" ? false : val === "true" || (out._.push((x = +val, x * 0 === 0) ? x : val), !!val) : (x = +val, x * 0 === 0) ? x : val;
	out[key] = old == null ? nxt : Array.isArray(old) ? old.concat(nxt) : [old, nxt];
}
function lib_default(args, opts) {
	args = args || [];
	opts = opts || {};
	var k, arr, arg, name, val, out = { _: [] };
	var i = 0, j = 0, idx = 0, len = args.length;
	const alibi = opts.alias !== void 0;
	const strict = opts.unknown !== void 0;
	const defaults = opts.default !== void 0;
	opts.alias = opts.alias || {};
	opts.string = toArr(opts.string);
	opts.boolean = toArr(opts.boolean);
	if (alibi) for (k in opts.alias) {
		arr = opts.alias[k] = toArr(opts.alias[k]);
		for (i = 0; i < arr.length; i++) (opts.alias[arr[i]] = arr.concat(k)).splice(i, 1);
	}
	for (i = opts.boolean.length; i-- > 0;) {
		arr = opts.alias[opts.boolean[i]] || [];
		for (j = arr.length; j-- > 0;) opts.boolean.push(arr[j]);
	}
	for (i = opts.string.length; i-- > 0;) {
		arr = opts.alias[opts.string[i]] || [];
		for (j = arr.length; j-- > 0;) opts.string.push(arr[j]);
	}
	if (defaults) for (k in opts.default) {
		name = typeof opts.default[k];
		arr = opts.alias[k] = opts.alias[k] || [];
		if (opts[name] !== void 0) {
			opts[name].push(k);
			for (i = 0; i < arr.length; i++) opts[name].push(arr[i]);
		}
	}
	const keys = strict ? Object.keys(opts.alias) : [];
	for (i = 0; i < len; i++) {
		arg = args[i];
		if (arg === "--") {
			out._ = out._.concat(args.slice(++i));
			break;
		}
		for (j = 0; j < arg.length; j++) if (arg.charCodeAt(j) !== 45) break;
		if (j === 0) out._.push(arg);
		else if (arg.substring(j, j + 3) === "no-") {
			name = arg.substring(j + 3);
			if (strict && !~keys.indexOf(name)) return opts.unknown(arg);
			out[name] = false;
		} else {
			for (idx = j + 1; idx < arg.length; idx++) if (arg.charCodeAt(idx) === 61) break;
			name = arg.substring(j, idx);
			val = arg.substring(++idx) || i + 1 === len || ("" + args[i + 1]).charCodeAt(0) === 45 || args[++i];
			arr = j === 2 ? [name] : name;
			for (idx = 0; idx < arr.length; idx++) {
				name = arr[idx];
				if (strict && !~keys.indexOf(name)) return opts.unknown("-".repeat(j) + name);
				toVal(out, name, idx + 1 < arr.length || val, opts);
			}
		}
	}
	if (defaults) {
		for (k in opts.default) if (out[k] === void 0) out[k] = opts.default[k];
	}
	if (alibi) for (k in out) {
		arr = opts.alias[k] || [];
		while (arr.length > 0) out[arr.shift()] = out[k];
	}
	return out;
}
function removeBrackets(v) {
	return v.replace(/[<[].+/, "").trim();
}
function findAllBrackets(v) {
	const ANGLED_BRACKET_RE_GLOBAL = /<([^>]+)>/g;
	const SQUARE_BRACKET_RE_GLOBAL = /\[([^\]]+)\]/g;
	const res = [];
	const parse = (match) => {
		let variadic = false;
		let value = match[1];
		if (value.startsWith("...")) {
			value = value.slice(3);
			variadic = true;
		}
		return {
			required: match[0].startsWith("<"),
			value,
			variadic
		};
	};
	let angledMatch;
	while (angledMatch = ANGLED_BRACKET_RE_GLOBAL.exec(v)) res.push(parse(angledMatch));
	let squareMatch;
	while (squareMatch = SQUARE_BRACKET_RE_GLOBAL.exec(v)) res.push(parse(squareMatch));
	return res;
}
function getMriOptions(options) {
	const result = {
		alias: {},
		boolean: []
	};
	for (const [index, option] of options.entries()) {
		if (option.names.length > 1) result.alias[option.names[0]] = option.names.slice(1);
		if (option.isBoolean) if (option.negated) {
			if (!options.some((o, i) => {
				return i !== index && o.names.some((name) => option.names.includes(name)) && typeof o.required === "boolean";
			})) result.boolean.push(option.names[0]);
		} else result.boolean.push(option.names[0]);
	}
	return result;
}
function findLongest(arr) {
	return arr.sort((a, b) => {
		return a.length > b.length ? -1 : 1;
	})[0];
}
function padRight(str, length) {
	return str.length >= length ? str : `${str}${" ".repeat(length - str.length)}`;
}
function camelcase(input) {
	return input.replaceAll(/([a-z])-([a-z])/g, (_, p1, p2) => {
		return p1 + p2.toUpperCase();
	});
}
function setDotProp(obj, keys, val) {
	let current = obj;
	for (let i = 0; i < keys.length; i++) {
		const key = keys[i];
		if (i === keys.length - 1) {
			current[key] = val;
			return;
		}
		if (current[key] == null) {
			const nextKeyIsArrayIndex = +keys[i + 1] > -1;
			current[key] = nextKeyIsArrayIndex ? [] : {};
		}
		current = current[key];
	}
}
function setByType(obj, transforms) {
	for (const key of Object.keys(transforms)) {
		const transform = transforms[key];
		if (transform.shouldTransform) {
			obj[key] = [obj[key]].flat();
			if (typeof transform.transformFunction === "function") obj[key] = obj[key].map(transform.transformFunction);
		}
	}
}
function getFileName(input) {
	const m = /([^\\/]+)$/.exec(input);
	return m ? m[1] : "";
}
function camelcaseOptionName(name) {
	return name.split(".").map((v, i) => {
		return i === 0 ? camelcase(v) : v;
	}).join(".");
}
var CACError = class extends Error {
	constructor(message) {
		super(message);
		this.name = "CACError";
		if (typeof Error.captureStackTrace !== "function") this.stack = new Error(message).stack;
	}
};
var Option = class {
	rawName;
	description;
	/** Option name */
	name;
	/** Option name and aliases */
	names;
	isBoolean;
	required;
	config;
	negated;
	constructor(rawName, description, config) {
		this.rawName = rawName;
		this.description = description;
		this.config = Object.assign({}, config);
		rawName = rawName.replaceAll(".*", "");
		this.negated = false;
		this.names = removeBrackets(rawName).split(",").map((v) => {
			let name = v.trim().replace(/^-{1,2}/, "");
			if (name.startsWith("no-")) {
				this.negated = true;
				name = name.replace(/^no-/, "");
			}
			return camelcaseOptionName(name);
		}).sort((a, b) => a.length > b.length ? 1 : -1);
		this.name = this.names.at(-1);
		if (this.negated && this.config.default == null) this.config.default = true;
		if (rawName.includes("<")) this.required = true;
		else if (rawName.includes("[")) this.required = false;
		else this.isBoolean = true;
	}
};
let runtimeProcessArgs;
let runtimeInfo;
if (typeof process !== "undefined") {
	let runtimeName;
	if (typeof Deno !== "undefined" && typeof Deno.version?.deno === "string") runtimeName = "deno";
	else if (typeof Bun !== "undefined" && typeof Bun.version === "string") runtimeName = "bun";
	else runtimeName = "node";
	runtimeInfo = `${process.platform}-${process.arch} ${runtimeName}-${process.version}`;
	runtimeProcessArgs = process.argv;
} else if (typeof navigator === "undefined") runtimeInfo = `unknown`;
else runtimeInfo = `${navigator.platform} ${navigator.userAgent}`;
var Command = class {
	rawName;
	description;
	config;
	cli;
	options;
	aliasNames;
	name;
	args;
	commandAction;
	usageText;
	versionNumber;
	examples;
	helpCallback;
	globalCommand;
	constructor(rawName, description, config = {}, cli) {
		this.rawName = rawName;
		this.description = description;
		this.config = config;
		this.cli = cli;
		this.options = [];
		this.aliasNames = [];
		this.name = removeBrackets(rawName);
		this.args = findAllBrackets(rawName);
		this.examples = [];
	}
	usage(text) {
		this.usageText = text;
		return this;
	}
	allowUnknownOptions() {
		this.config.allowUnknownOptions = true;
		return this;
	}
	ignoreOptionDefaultValue() {
		this.config.ignoreOptionDefaultValue = true;
		return this;
	}
	version(version, customFlags = "-v, --version") {
		this.versionNumber = version;
		this.option(customFlags, "Display version number");
		return this;
	}
	example(example) {
		this.examples.push(example);
		return this;
	}
	/**
	* Add a option for this command
	* @param rawName Raw option name(s)
	* @param description Option description
	* @param config Option config
	*/
	option(rawName, description, config) {
		const option = new Option(rawName, description, config);
		this.options.push(option);
		return this;
	}
	alias(name) {
		this.aliasNames.push(name);
		return this;
	}
	action(callback) {
		this.commandAction = callback;
		return this;
	}
	/**
	* Check if a command name is matched by this command
	* @param name Command name
	*/
	isMatched(name) {
		return this.name === name || this.aliasNames.includes(name);
	}
	get isDefaultCommand() {
		return this.name === "" || this.aliasNames.includes("!");
	}
	get isGlobalCommand() {
		return this instanceof GlobalCommand;
	}
	/**
	* Check if an option is registered in this command
	* @param name Option name
	*/
	hasOption(name) {
		name = name.split(".")[0];
		return this.options.find((option) => {
			return option.names.includes(name);
		});
	}
	outputHelp() {
		const { name, commands } = this.cli;
		const { versionNumber, options: globalOptions, helpCallback } = this.cli.globalCommand;
		let sections = [{ body: `${name}${versionNumber ? `/${versionNumber}` : ""}` }];
		sections.push({
			title: "Usage",
			body: `  $ ${name} ${this.usageText || this.rawName}`
		});
		if ((this.isGlobalCommand || this.isDefaultCommand) && commands.length > 0) {
			const longestCommandName = findLongest(commands.map((command) => command.rawName));
			sections.push({
				title: "Commands",
				body: commands.map((command) => {
					return `  ${padRight(command.rawName, longestCommandName.length)}  ${command.description}`;
				}).join("\n")
			}, {
				title: `For more info, run any command with the \`--help\` flag`,
				body: commands.map((command) => `  $ ${name}${command.name === "" ? "" : ` ${command.name}`} --help`).join("\n")
			});
		}
		let options = this.isGlobalCommand ? globalOptions : [...this.options, ...globalOptions || []];
		if (!this.isGlobalCommand && !this.isDefaultCommand) options = options.filter((option) => option.name !== "version");
		if (options.length > 0) {
			const longestOptionName = findLongest(options.map((option) => option.rawName));
			sections.push({
				title: "Options",
				body: options.map((option) => {
					return `  ${padRight(option.rawName, longestOptionName.length)}  ${option.description} ${option.config.default === void 0 ? "" : `(default: ${option.config.default})`}`;
				}).join("\n")
			});
		}
		if (this.examples.length > 0) sections.push({
			title: "Examples",
			body: this.examples.map((example) => {
				if (typeof example === "function") return example(name);
				return example;
			}).join("\n")
		});
		if (helpCallback) sections = helpCallback(sections) || sections;
		console.info(sections.map((section) => {
			return section.title ? `${section.title}:\n${section.body}` : section.body;
		}).join("\n\n"));
	}
	outputVersion() {
		const { name } = this.cli;
		const { versionNumber } = this.cli.globalCommand;
		if (versionNumber) console.info(`${name}/${versionNumber} ${runtimeInfo}`);
	}
	checkRequiredArgs() {
		const minimalArgsCount = this.args.filter((arg) => arg.required).length;
		if (this.cli.args.length < minimalArgsCount) throw new CACError(`missing required args for command \`${this.rawName}\``);
	}
	/**
	* Check if the parsed options contain any unknown options
	*
	* Exit and output error when true
	*/
	checkUnknownOptions() {
		const { options, globalCommand } = this.cli;
		if (!this.config.allowUnknownOptions) {
			for (const name of Object.keys(options)) if (name !== "--" && !this.hasOption(name) && !globalCommand.hasOption(name)) throw new CACError(`Unknown option \`${name.length > 1 ? `--${name}` : `-${name}`}\``);
		}
	}
	/**
	* Check if the required string-type options exist
	*/
	checkOptionValue() {
		const { options: parsedOptions, globalCommand } = this.cli;
		const options = [...globalCommand.options, ...this.options];
		for (const option of options) {
			const value = parsedOptions[option.name.split(".")[0]];
			if (option.required) {
				const hasNegated = options.some((o) => o.negated && o.names.includes(option.name));
				if (value === true || value === false && !hasNegated) throw new CACError(`option \`${option.rawName}\` value is missing`);
			}
		}
	}
	/**
	* Check if the number of args is more than expected
	*/
	checkUnusedArgs() {
		const maximumArgsCount = this.args.some((arg) => arg.variadic) ? Infinity : this.args.length;
		if (maximumArgsCount < this.cli.args.length) throw new CACError(`Unused args: ${this.cli.args.slice(maximumArgsCount).map((arg) => `\`${arg}\``).join(", ")}`);
	}
};
var GlobalCommand = class extends Command {
	constructor(cli) {
		super("@@global@@", "", {}, cli);
	}
};
var CAC = class extends EventTarget {
	/** The program name to display in help and version message */
	name;
	commands;
	globalCommand;
	matchedCommand;
	matchedCommandName;
	/**
	* Raw CLI arguments
	*/
	rawArgs;
	/**
	* Parsed CLI arguments
	*/
	args;
	/**
	* Parsed CLI options, camelCased
	*/
	options;
	showHelpOnExit;
	showVersionOnExit;
	/**
	* @param name The program name to display in help and version message
	*/
	constructor(name = "") {
		super();
		this.name = name;
		this.commands = [];
		this.rawArgs = [];
		this.args = [];
		this.options = {};
		this.globalCommand = new GlobalCommand(this);
		this.globalCommand.usage("<command> [options]");
	}
	/**
	* Add a global usage text.
	*
	* This is not used by sub-commands.
	*/
	usage(text) {
		this.globalCommand.usage(text);
		return this;
	}
	/**
	* Add a sub-command
	*/
	command(rawName, description, config) {
		const command = new Command(rawName, description || "", config, this);
		command.globalCommand = this.globalCommand;
		this.commands.push(command);
		return command;
	}
	/**
	* Add a global CLI option.
	*
	* Which is also applied to sub-commands.
	*/
	option(rawName, description, config) {
		this.globalCommand.option(rawName, description, config);
		return this;
	}
	/**
	* Show help message when `-h, --help` flags appear.
	*
	*/
	help(callback) {
		this.globalCommand.option("-h, --help", "Display this message");
		this.globalCommand.helpCallback = callback;
		this.showHelpOnExit = true;
		return this;
	}
	/**
	* Show version number when `-v, --version` flags appear.
	*
	*/
	version(version, customFlags = "-v, --version") {
		this.globalCommand.version(version, customFlags);
		this.showVersionOnExit = true;
		return this;
	}
	/**
	* Add a global example.
	*
	* This example added here will not be used by sub-commands.
	*/
	example(example) {
		this.globalCommand.example(example);
		return this;
	}
	/**
	* Output the corresponding help message
	* When a sub-command is matched, output the help message for the command
	* Otherwise output the global one.
	*
	*/
	outputHelp() {
		if (this.matchedCommand) this.matchedCommand.outputHelp();
		else this.globalCommand.outputHelp();
	}
	/**
	* Output the version number.
	*
	*/
	outputVersion() {
		this.globalCommand.outputVersion();
	}
	setParsedInfo({ args, options }, matchedCommand, matchedCommandName) {
		this.args = args;
		this.options = options;
		if (matchedCommand) this.matchedCommand = matchedCommand;
		if (matchedCommandName) this.matchedCommandName = matchedCommandName;
		return this;
	}
	unsetMatchedCommand() {
		this.matchedCommand = void 0;
		this.matchedCommandName = void 0;
	}
	/**
	* Parse argv
	*/
	parse(argv, { run = true } = {}) {
		if (!argv) {
			if (!runtimeProcessArgs) throw new Error("No argv provided and runtime process argv is not available.");
			argv = runtimeProcessArgs;
		}
		this.rawArgs = argv;
		if (!this.name) this.name = argv[1] ? getFileName(argv[1]) : "cli";
		let shouldParse = true;
		for (const command of this.commands) {
			const parsed = this.mri(argv.slice(2), command);
			const commandName = parsed.args[0];
			if (command.isMatched(commandName)) {
				shouldParse = false;
				const parsedInfo = {
					...parsed,
					args: parsed.args.slice(1)
				};
				this.setParsedInfo(parsedInfo, command, commandName);
				this.dispatchEvent(new CustomEvent(`command:${commandName}`, { detail: command }));
			}
		}
		if (shouldParse) {
			for (const command of this.commands) if (command.isDefaultCommand) {
				shouldParse = false;
				const parsed = this.mri(argv.slice(2), command);
				this.setParsedInfo(parsed, command);
				this.dispatchEvent(new CustomEvent("command:!", { detail: command }));
			}
		}
		if (shouldParse) {
			const parsed = this.mri(argv.slice(2));
			this.setParsedInfo(parsed);
		}
		if (this.options.help && this.showHelpOnExit) {
			this.outputHelp();
			run = false;
			this.unsetMatchedCommand();
		}
		if (this.options.version && this.showVersionOnExit && this.matchedCommandName == null) {
			this.outputVersion();
			run = false;
			this.unsetMatchedCommand();
		}
		const parsedArgv = {
			args: this.args,
			options: this.options
		};
		if (run) this.runMatchedCommand();
		if (!this.matchedCommand && this.args[0]) this.dispatchEvent(new CustomEvent("command:*", { detail: this.args[0] }));
		return parsedArgv;
	}
	mri(argv, command) {
		const cliOptions = [...this.globalCommand.options, ...command ? command.options : []];
		const mriOptions = getMriOptions(cliOptions);
		let argsAfterDoubleDashes = [];
		const doubleDashesIndex = argv.indexOf("--");
		if (doubleDashesIndex !== -1) {
			argsAfterDoubleDashes = argv.slice(doubleDashesIndex + 1);
			argv = argv.slice(0, doubleDashesIndex);
		}
		let parsed = lib_default(argv, mriOptions);
		parsed = Object.keys(parsed).reduce((res, name) => {
			return {
				...res,
				[camelcaseOptionName(name)]: parsed[name]
			};
		}, { _: [] });
		const args = parsed._;
		const options = { "--": argsAfterDoubleDashes };
		const ignoreDefault = command && command.config.ignoreOptionDefaultValue ? command.config.ignoreOptionDefaultValue : this.globalCommand.config.ignoreOptionDefaultValue;
		const transforms = Object.create(null);
		for (const cliOption of cliOptions) {
			if (!ignoreDefault && cliOption.config.default !== void 0) for (const name of cliOption.names) options[name] = cliOption.config.default;
			if (Array.isArray(cliOption.config.type) && transforms[cliOption.name] === void 0) {
				transforms[cliOption.name] = Object.create(null);
				transforms[cliOption.name].shouldTransform = true;
				transforms[cliOption.name].transformFunction = cliOption.config.type[0];
			}
		}
		for (const key of Object.keys(parsed)) if (key !== "_") {
			setDotProp(options, key.split("."), parsed[key]);
			setByType(options, transforms);
		}
		return {
			args,
			options
		};
	}
	runMatchedCommand() {
		const { args, options, matchedCommand: command } = this;
		if (!command || !command.commandAction) return;
		command.checkUnknownOptions();
		command.checkOptionValue();
		command.checkRequiredArgs();
		command.checkUnusedArgs();
		const actionArgs = [];
		command.args.forEach((arg, index) => {
			if (arg.variadic) actionArgs.push(args.slice(index));
			else actionArgs.push(args[index]);
		});
		actionArgs.push(options);
		return command.commandAction.apply(this, actionArgs);
	}
};
/**
* @param name The program name to display in help and version message
*/
const cac = (name = "") => new CAC(name);
//#endregion
//#region node_modules/.pnpm/tinyexec@1.2.4/node_modules/tinyexec/dist/main.mjs
const h = /^path$/i;
const g = {
	key: "PATH",
	value: ""
};
function _(e) {
	for (const t in e) {
		if (!Object.prototype.hasOwnProperty.call(e, t) || !h.test(t)) continue;
		const n = e[t];
		if (!n) return g;
		return {
			key: t,
			value: n
		};
	}
	return g;
}
function v(e, t) {
	const n = t.value.split(delimiter);
	const r = [];
	let o = e;
	let c;
	do {
		r.push(resolve(o, "node_modules", ".bin"));
		c = o;
		o = dirname(o);
	} while (o !== c);
	r.push(dirname(process.execPath));
	const l = r.concat(n).join(delimiter);
	return {
		key: t.key,
		value: l
	};
}
function y(e, t, n = true) {
	const r = {
		...process.env,
		...t
	};
	if (!n) return r;
	const i = v(e, _(r));
	r[i.key] = i.value;
	return r;
}
const b = (e) => {
	let t = e.length;
	const n = new PassThrough();
	const r = () => {
		if (--t === 0) n.end();
	};
	for (const t of e) pipeline(t, n, { end: false }).then(r).catch(r);
	return n;
};
const x = /([()\][%!^"`<>&|;, *?])/g;
const S = /^#!\s*(.+)/;
const C = /\.(?:com|exe)$/i;
const w = /node_modules[\\/]\.bin[\\/][^\\/]+\.cmd$/i;
const T = process.platform === "win32";
const E = [
	".EXE",
	".CMD",
	".BAT",
	".COM"
];
/**
* Normalizes the command and arguments to work cross-platform.
* On Windows, this basically handles things like shebangs, calling
* `node_modules/.bin` commands, and escaping meta characters.
* On other platforms, it just returns the command and arguments as-is.
*/
function D(e, t = [], n = {}) {
	if (n.shell === true || !T) return {
		command: e,
		args: t,
		options: n
	};
	let i = O(e, n);
	let a = null;
	if (i !== null) {
		const e = 150;
		const t = Buffer.alloc(e);
		let n = null;
		try {
			n = openSync(i, "r");
			readSync(n, t, 0, e, 0);
		} catch {} finally {
			if (n !== null) closeSync(n);
		}
		const o = t.toString().match(S);
		if (o !== null) {
			const e = o[1].trim();
			const t = e.indexOf(" ");
			const n = t !== -1 ? e.slice(0, t) : e;
			const i = t !== -1 ? e.slice(t + 1) : "";
			const s = basename(n);
			a = s === "env" ? i || null : s;
		}
	}
	if (a !== null && i !== null) {
		t = [i, ...t];
		e = a;
		i = O(e, n);
	}
	if (i === null || !C.test(i)) {
		const r = i !== null && w.test(i);
		e = normalize(e);
		e = e.replace(x, "^$1");
		t = t.map((e) => {
			e = e.replace(/(?=(\\+?)?)\1"/g, "$1$1\\\"");
			e = e.replace(/(?=(\\+?)?)\1$/, "$1$1");
			e = `"${e}"`;
			e = e.replace(x, "^$1");
			if (r) e = e.replace(x, "^$1");
			return e;
		});
		t = [
			"/d",
			"/s",
			"/c",
			`"${[e, ...t].join(" ")}"`
		];
		e = n.env?.comspec ?? "cmd.exe";
		n = {
			...n,
			windowsVerbatimArguments: true
		};
	}
	return {
		command: e,
		args: t,
		options: n
	};
}
/**
* Resolves the command to an absolute path if possible.
* Handles things like traversing PATH and adding extensions from PATHEXT
*/
function O(e, t) {
	const r = (t.cwd ?? cwd()).toString();
	const a = t.env ?? process.env;
	const o = _(a).value;
	const c = e.includes("/") || e.includes("\\") ? [""] : [r, ...o.split(delimiter)];
	const l = a.PATHEXT ? a.PATHEXT.split(delimiter) : E;
	if (e.includes(".") && l[0] !== "") l.unshift("");
	for (const t of c) {
		const n = resolve(r, t.startsWith("\"") && t.endsWith("\"") && t.length > 1 ? t.slice(1, -1) : t, e);
		for (const e of l) {
			const t = n + e;
			try {
				if (statSync(t).isFile()) return t;
			} catch {}
		}
	}
	return null;
}
var k = class extends Error {
	result;
	output;
	get exitCode() {
		if (this.result.exitCode !== null) return this.result.exitCode;
	}
	constructor(e, t) {
		super(`Process exited with non-zero status (${e.exitCode})`);
		this.result = e;
		this.output = t;
	}
};
const j = {
	timeout: void 0,
	persist: false
};
const N = { windowsHide: true };
function P(e) {
	const t = new AbortController();
	for (const n of e) {
		if (n.aborted) {
			t.abort();
			return n;
		}
		const e = () => {
			t.abort(n.reason);
		};
		n.addEventListener("abort", e, { signal: t.signal });
	}
	return t.signal;
}
async function F(e) {
	let t = "";
	try {
		for await (const n of e) t += n.toString();
	} catch {}
	return t;
}
var I = class {
	_process;
	_aborted = false;
	_options;
	_command;
	_args;
	_resolveClose;
	_processClosed;
	_thrownError;
	get process() {
		return this._process;
	}
	get pid() {
		return this._process?.pid;
	}
	get exitCode() {
		if (this._process && this._process.exitCode !== null) return this._process.exitCode;
	}
	constructor(e, t, n) {
		this._options = {
			...j,
			...n
		};
		this._command = e;
		this._args = t ?? [];
		this._processClosed = new Promise((e) => {
			this._resolveClose = e;
		});
	}
	kill(e) {
		return this._process?.kill(e) === true;
	}
	get aborted() {
		return this._aborted;
	}
	get killed() {
		return this._process?.killed === true;
	}
	pipe(e, t, n) {
		return z(e, t, {
			...n,
			stdin: this
		});
	}
	async *[Symbol.asyncIterator]() {
		const e = this._process;
		if (!e) return;
		const t = [];
		if (this._streamErr) t.push(this._streamErr);
		if (this._streamOut) t.push(this._streamOut);
		const n = b(t);
		const r = u.createInterface({ input: n });
		for await (const e of r) yield e.toString();
		await this._processClosed;
		e.removeAllListeners();
		if (this._thrownError) throw this._thrownError;
		if (this._options?.throwOnError && this.exitCode !== 0 && this.exitCode !== void 0) throw new k(this);
	}
	async _waitForOutput() {
		const e = this._process;
		if (!e) throw new Error("No process was started");
		const [t, n] = await Promise.all([this._streamOut ? F(this._streamOut) : "", this._streamErr ? F(this._streamErr) : ""]);
		await this._processClosed;
		const { stdin: r } = this._options;
		if (r && typeof r !== "string") await r;
		e.removeAllListeners();
		if (this._thrownError) throw this._thrownError;
		const i = {
			stderr: n,
			stdout: t,
			exitCode: this.exitCode
		};
		if (this._options.throwOnError && this.exitCode !== 0 && this.exitCode !== void 0) throw new k(this, i);
		return i;
	}
	then(e, t) {
		return this._waitForOutput().then(e, t);
	}
	_streamOut;
	_streamErr;
	spawn() {
		const t = cwd();
		const r = this._options;
		const i = {
			...N,
			...r.nodeOptions
		};
		const a = [];
		this._resetState();
		if (r.timeout !== void 0) a.push(AbortSignal.timeout(r.timeout));
		if (r.signal !== void 0) a.push(r.signal);
		if (r.persist === true) i.detached = true;
		if (a.length > 0) i.signal = P(a);
		i.env = y(t, i.env, r.nodePath);
		const o = D(this._command, this._args, i);
		const s = spawn(o.command, o.args, o.options);
		if (s.stderr) this._streamErr = s.stderr;
		if (s.stdout) this._streamOut = s.stdout;
		this._process = s;
		s.once("error", this._onError);
		s.once("close", this._onClose);
		if (s.stdin) {
			const { stdin: e } = r;
			if (typeof e === "string") s.stdin.end(e);
			else e?.process?.stdout?.pipe(s.stdin);
		}
	}
	_resetState() {
		this._aborted = false;
		this._processClosed = new Promise((e) => {
			this._resolveClose = e;
		});
		this._thrownError = void 0;
	}
	_onError = (e) => {
		if (e.name === "AbortError" && (!(e.cause instanceof Error) || e.cause.name !== "TimeoutError")) {
			this._aborted = true;
			return;
		}
		this._thrownError = e;
	};
	_onClose = () => {
		if (this._resolveClose) this._resolveClose();
	};
};
const R = (e, t, n) => {
	const r = new I(e, t, n);
	r.spawn();
	return r;
};
const z = R;
//#endregion
//#region node_modules/.pnpm/verkit@0.3.0/node_modules/verkit/dist/index.js
const LETTER_DASH_NUMBER = "[a-zA-Z0-9-]";
const NUMERIC_IDENTIFIER = String.raw`0|[1-9]\d*`;
const NUMERIC_IDENTIFIER_LOOSE = String.raw`\d+`;
const NON_NUMERIC_IDENTIFIER = String.raw`\d*[a-zA-Z-]${LETTER_DASH_NUMBER}*`;
const MAIN_VERSION = String.raw`(${NUMERIC_IDENTIFIER})\.(${NUMERIC_IDENTIFIER})\.(${NUMERIC_IDENTIFIER})`;
const MAIN_VERSION_LOOSE = String.raw`(${NUMERIC_IDENTIFIER_LOOSE})\.(${NUMERIC_IDENTIFIER_LOOSE})\.(${NUMERIC_IDENTIFIER_LOOSE})`;
const PRERELEASE_IDENTIFIER = `(?:${NON_NUMERIC_IDENTIFIER}|${NUMERIC_IDENTIFIER})`;
const PRERELEASE_IDENTIFIER_LOOSE = `(?:${NON_NUMERIC_IDENTIFIER}|${NUMERIC_IDENTIFIER_LOOSE})`;
const PRERELEASE = String.raw`(?:-(${PRERELEASE_IDENTIFIER}(?:\.${PRERELEASE_IDENTIFIER})*))`;
const PRERELEASE_LOOSE = String.raw`(?:-?(${PRERELEASE_IDENTIFIER_LOOSE}(?:\.${PRERELEASE_IDENTIFIER_LOOSE})*))`;
const BUILD_IDENTIFIER = `${LETTER_DASH_NUMBER}+`;
const BUILD = String.raw`(?:\+(${BUILD_IDENTIFIER}(?:\.${BUILD_IDENTIFIER})*))`;
const FULL_PLAIN = `v?${MAIN_VERSION}${PRERELEASE}?${BUILD}?`;
const LOOSE_PLAIN = String.raw`[v=\s]*${MAIN_VERSION_LOOSE}${PRERELEASE_LOOSE}?${BUILD}?`;
const GREATER_LESS_THAN = "((?:<|>)?=?)";
const XRANGE_IDENTIFIER = String.raw`${NUMERIC_IDENTIFIER}|x|X|\*`;
const XRANGE_IDENTIFIER_LOOSE = String.raw`${NUMERIC_IDENTIFIER_LOOSE}|x|X|\*`;
const XRANGE_PLAIN = String.raw`[v=\s]*(${XRANGE_IDENTIFIER})(?:\.(${XRANGE_IDENTIFIER})(?:\.(${XRANGE_IDENTIFIER})(?:${PRERELEASE})?${BUILD}?)?)?`;
const XRANGE_PLAIN_LOOSE = String.raw`[v=\s]*(${XRANGE_IDENTIFIER_LOOSE})(?:\.(${XRANGE_IDENTIFIER_LOOSE})(?:\.(${XRANGE_IDENTIFIER_LOOSE})(?:${PRERELEASE_LOOSE})?${BUILD}?)?)?`;
const LONE_TILDE = "(?:~>?)";
const LONE_CARET = String.raw`(?:\^)`;
const COERCE_PLAIN = String.raw`(^|[^\d])(\d{1,${16}})(?:\.(\d{1,${16}}))?(?:\.(\d{1,${16}}))?`;
const COERCE = String.raw`${COERCE_PLAIN}(?:$|[^\d])`;
const COERCE_FULL = String.raw`${COERCE_PLAIN}(?:${PRERELEASE})?(?:${BUILD})?(?:$|[^\d])`;
function makeSafeRegexSource(source) {
	const replacements = [
		[String.raw`\s`, 1],
		[String.raw`\d`, 256],
		[LETTER_DASH_NUMBER, 250]
	];
	for (const [token, maximum] of replacements) source = source.split(`${token}*`).join(`${token}{0,${maximum}}`).split(`${token}+`).join(`${token}{1,${maximum}}`);
	return source;
}
function safeRegex(source, flags) {
	return new RegExp(makeSafeRegexSource(source), flags);
}
const NUMERIC$1 = /^\d+$/;
function compareIdentifiers(left, right) {
	if (typeof left === "number" && typeof right === "number") return left === right ? 0 : left < right ? -1 : 1;
	const leftNumeric = NUMERIC$1.test(String(left));
	const rightNumeric = NUMERIC$1.test(String(right));
	const normalizedLeft = leftNumeric ? Number(left) : left;
	const normalizedRight = rightNumeric ? Number(right) : right;
	return normalizedLeft === normalizedRight ? 0 : leftNumeric && !rightNumeric ? -1 : rightNumeric && !leftNumeric ? 1 : normalizedLeft < normalizedRight ? -1 : 1;
}
const FULL = safeRegex(`^${FULL_PLAIN}$`);
const LOOSE = safeRegex(`^${LOOSE_PLAIN}$`);
safeRegex(`^${PRERELEASE}$`);
safeRegex(`^${PRERELEASE_LOOSE}$`);
safeRegex(COERCE);
safeRegex(COERCE_FULL);
const NUMERIC = /^\d+$/;
function formatComparableVersion(version) {
	const base = `${version.major}.${version.minor}.${version.patch}`;
	return version.prerelease?.length ? `${base}-${version.prerelease.join(".")}` : base;
}
function parse$1(version, options = {}) {
	if (typeof version !== "string") return version;
	if (version.length > 256) throw new TypeError(`Version exceeds the maximum length of 256 characters`);
	const match = version.trim().match(options.loose ? LOOSE : FULL);
	if (!match) throw new TypeError(`Invalid version syntax: ${version}`);
	const major = Number(match[1]);
	const minor = Number(match[2]);
	const patch = Number(match[3]);
	if (major > Number.MAX_SAFE_INTEGER || major < 0) throw new TypeError(`Invalid major version: ${match[1]}`);
	if (minor > Number.MAX_SAFE_INTEGER || minor < 0) throw new TypeError(`Invalid minor version: ${match[2]}`);
	if (patch > Number.MAX_SAFE_INTEGER || patch < 0) throw new TypeError(`Invalid patch version: ${match[3]}`);
	const prerelease = match[4] ? match[4].split(".").map((identifier) => {
		if (NUMERIC.test(identifier)) {
			const numeric = Number(identifier);
			if (numeric >= 0 && numeric < Number.MAX_SAFE_INTEGER) return numeric;
		}
		return identifier;
	}) : void 0;
	return {
		build: match[5]?.split("."),
		major,
		minor,
		patch,
		prerelease
	};
}
function tryParse(version, options = {}) {
	try {
		return parse$1(version, options);
	} catch {
		return null;
	}
}
function compareMainParsed(left, right) {
	return left.major === right.major ? left.minor === right.minor ? left.patch === right.patch ? 0 : left.patch < right.patch ? -1 : 1 : left.minor < right.minor ? -1 : 1 : left.major < right.major ? -1 : 1;
}
function comparePrereleaseParsed(left, right) {
	const leftPrerelease = left.prerelease;
	const rightPrerelease = right.prerelease;
	if (leftPrerelease?.length && !rightPrerelease?.length) return -1;
	if (!leftPrerelease?.length && rightPrerelease?.length) return 1;
	if (!leftPrerelease?.length && !rightPrerelease?.length) return 0;
	for (let index = 0;; index++) {
		const leftIdentifier = leftPrerelease?.[index];
		const rightIdentifier = rightPrerelease?.[index];
		if (leftIdentifier === void 0 && rightIdentifier === void 0) return 0;
		if (rightIdentifier === void 0) return 1;
		if (leftIdentifier === void 0) return -1;
		if (leftIdentifier !== rightIdentifier) return compareIdentifiers(leftIdentifier, rightIdentifier);
	}
}
function compareParsed(left, right) {
	return compareMainParsed(left, right) || comparePrereleaseParsed(left, right);
}
function compareBuildParsed(left, right) {
	const precedence = compareParsed(left, right);
	if (precedence !== 0) return precedence;
	for (let index = 0;; index++) {
		const leftIdentifier = left.build?.[index];
		const rightIdentifier = right.build?.[index];
		if (leftIdentifier === void 0 && rightIdentifier === void 0) return 0;
		if (rightIdentifier === void 0) return 1;
		if (leftIdentifier === void 0) return -1;
		if (leftIdentifier !== rightIdentifier) return compareIdentifiers(leftIdentifier, rightIdentifier);
	}
}
const STRICT_COMPARATOR = safeRegex(String.raw`^${GREATER_LESS_THAN}\s*(${FULL_PLAIN})$|^$`);
const LOOSE_COMPARATOR$1 = safeRegex(String.raw`^${GREATER_LESS_THAN}\s*(${LOOSE_PLAIN})$|^$`);
function parseComparator(comparator, options = {}) {
	const normalized = comparator.trim().replaceAll(/\s+/g, " ");
	const match = normalized.match(options.loose ? LOOSE_COMPARATOR$1 : STRICT_COMPARATOR);
	if (!match) throw new TypeError(`Invalid comparator: ${normalized}`);
	const operator = match[1] === "=" ? "" : match[1] || "";
	const version = match[2] ? parse$1(match[2], options) : null;
	return {
		operator,
		options,
		value: version ? `${operator}${formatComparableVersion(version)}` : "",
		version
	};
}
function testParsedComparator(comparator, version) {
	if (!comparator.version) return true;
	const comparison = compareParsed(version, comparator.version);
	switch (comparator.operator) {
		case "": return comparison === 0;
		case ">": return comparison > 0;
		case ">=": return comparison >= 0;
		case "<": return comparison < 0;
		case "<=": return comparison <= 0;
	}
}
function compare(left, right, options = {}) {
	return compareParsed(parse$1(left, options), parse$1(right, options));
}
function compareBuild(left, right, options = {}) {
	return compareBuildParsed(parse$1(left, options), parse$1(right, options));
}
function sortReversed(versions, options = {}) {
	return versions.toSorted((left, right) => compareBuild(right, left, options));
}
const BUILD_STRIP = new RegExp(BUILD, "g");
const BUILD_SAFE = safeRegex(BUILD);
const STRICT_HYPHEN = safeRegex(String.raw`^\s*(${XRANGE_PLAIN})\s+-\s+(${XRANGE_PLAIN})\s*$`);
const LOOSE_HYPHEN = safeRegex(String.raw`^\s*(${XRANGE_PLAIN_LOOSE})\s+-\s+(${XRANGE_PLAIN_LOOSE})\s*$`);
const COMPARATOR_TRIM = safeRegex(String.raw`(\s*)${GREATER_LESS_THAN}\s*(${LOOSE_PLAIN}|${XRANGE_PLAIN})`, "g");
const TILDE_TRIM = safeRegex(String.raw`(\s*)${LONE_TILDE}\s+`, "g");
const CARET_TRIM = safeRegex(String.raw`(\s*)${LONE_CARET}\s+`, "g");
const STRICT_TILDE = safeRegex(`^${LONE_TILDE}${XRANGE_PLAIN}$`);
const LOOSE_TILDE = safeRegex(`^${LONE_TILDE}${XRANGE_PLAIN_LOOSE}$`);
const STRICT_CARET = safeRegex(`^${LONE_CARET}${XRANGE_PLAIN}$`);
const LOOSE_CARET = safeRegex(`^${LONE_CARET}${XRANGE_PLAIN_LOOSE}$`);
const STRICT_XRANGE = safeRegex(String.raw`^${GREATER_LESS_THAN}\s*${XRANGE_PLAIN}$`);
const LOOSE_XRANGE = safeRegex(String.raw`^${GREATER_LESS_THAN}\s*${XRANGE_PLAIN_LOOSE}$`);
const STAR = safeRegex(String.raw`(<|>)?=?\s*\*`);
const GTE_ZERO = /^\s*>=\s*0\.0\.0\s*$/;
const GTE_ZERO_PRERELEASE = /^\s*>=\s*0\.0\.0-0\s*$/;
const LOOSE_COMPARATOR = safeRegex(String.raw`^${GREATER_LESS_THAN}\s*(${LOOSE_PLAIN})$|^$`);
function isWildcard(value) {
	return !value || String(value).toLowerCase() === "x" || String(value) === "*";
}
function hasInvalidWildcardOrder(major, minor, patch) {
	return isWildcard(major) && !isWildcard(minor) || isWildcard(minor) && Boolean(patch) && !isWildcard(patch);
}
function replaceTilde(comparator, options) {
	const expression = options.loose ? LOOSE_TILDE : STRICT_TILDE;
	const lowerPrerelease = options.includePrerelease ? "-0" : "";
	return comparator.replace(expression, (_match, major, minor, patch, prerelease) => {
		if (isWildcard(major)) return "";
		if (isWildcard(minor)) return `>=${major}.0.0${lowerPrerelease} <${Number(major) + 1}.0.0-0`;
		if (isWildcard(patch)) return `>=${major}.${minor}.0${lowerPrerelease} <${major}.${Number(minor) + 1}.0-0`;
		return prerelease ? `>=${major}.${minor}.${patch}-${prerelease} <${major}.${Number(minor) + 1}.0-0` : `>=${major}.${minor}.${patch} <${major}.${Number(minor) + 1}.0-0`;
	});
}
function replaceTildes(comparator, options) {
	return comparator.trim().split(/\s+/).map((part) => replaceTilde(part, options)).join(" ");
}
function replaceCaret(comparator, options) {
	const expression = options.loose ? LOOSE_CARET : STRICT_CARET;
	const lowerPrerelease = options.includePrerelease ? "-0" : "";
	return comparator.replace(expression, (_match, major, minor, patch, prerelease) => {
		if (isWildcard(major)) return "";
		if (isWildcard(minor)) return `>=${major}.0.0${lowerPrerelease} <${Number(major) + 1}.0.0-0`;
		if (isWildcard(patch)) return major === "0" ? `>=${major}.${minor}.0${lowerPrerelease} <${major}.${Number(minor) + 1}.0-0` : `>=${major}.${minor}.0${lowerPrerelease} <${Number(major) + 1}.0.0-0`;
		if (prerelease) return major === "0" ? minor === "0" ? `>=${major}.${minor}.${patch}-${prerelease} <${major}.${minor}.${Number(patch) + 1}-0` : `>=${major}.${minor}.${patch}-${prerelease} <${major}.${Number(minor) + 1}.0-0` : `>=${major}.${minor}.${patch}-${prerelease} <${Number(major) + 1}.0.0-0`;
		return major === "0" ? minor === "0" ? `>=${major}.${minor}.${patch} <${major}.${minor}.${Number(patch) + 1}-0` : `>=${major}.${minor}.${patch} <${major}.${Number(minor) + 1}.0-0` : `>=${major}.${minor}.${patch} <${Number(major) + 1}.0.0-0`;
	});
}
function replaceCarets(comparator, options) {
	return comparator.trim().split(/\s+/).map((part) => replaceCaret(part, options)).join(" ");
}
function replaceXRange(comparator, options) {
	const expression = options.loose ? LOOSE_XRANGE : STRICT_XRANGE;
	return comparator.trim().replace(expression, (match, rawOperator, rawMajor, rawMinor, rawPatch) => {
		let operator = rawOperator;
		let major = rawMajor;
		let minor = rawMinor;
		let patch = rawPatch;
		if (hasInvalidWildcardOrder(String(major), minor === void 0 ? void 0 : String(minor), patch === void 0 ? void 0 : String(patch))) return comparator;
		const wildcardMajor = isWildcard(major);
		const wildcardMinor = wildcardMajor || isWildcard(minor);
		const wildcardPatch = wildcardMinor || isWildcard(patch);
		if (operator === "=" && wildcardPatch) operator = "";
		if (wildcardMajor) return operator === ">" || operator === "<" ? "<0.0.0-0" : "*";
		let prerelease = options.includePrerelease ? "-0" : "";
		if (operator && wildcardPatch) {
			if (wildcardMinor) minor = 0;
			patch = 0;
			if (operator === ">") {
				operator = ">=";
				if (wildcardMinor) {
					major = Number(major) + 1;
					minor = 0;
				} else minor = Number(minor) + 1;
			} else if (operator === "<=") {
				operator = "<";
				if (wildcardMinor) major = Number(major) + 1;
				else minor = Number(minor) + 1;
			}
			if (operator === "<") prerelease = "-0";
			return `${operator}${major}.${minor}.${patch}${prerelease}`;
		}
		if (wildcardMinor) return `>=${major}.0.0${prerelease} <${Number(major) + 1}.0.0-0`;
		if (wildcardPatch) return `>=${major}.${minor}.0${prerelease} <${major}.${Number(minor) + 1}.0-0`;
		return match;
	});
}
function replaceXRanges(comparator, options) {
	return comparator.split(/\s+/).map((part) => replaceXRange(part, options)).join(" ");
}
function replaceHyphenRange(range, options) {
	const expression = options.loose ? LOOSE_HYPHEN : STRICT_HYPHEN;
	return range.replace(expression, (_match, rawFrom, fromMajor, fromMinor, fromPatch, fromPrerelease, _fromBuild, rawTo, toMajor, toMinor, toPatch, toPrerelease) => {
		let from = rawFrom;
		let to = rawTo;
		if (isWildcard(fromMajor)) from = "";
		else if (isWildcard(fromMinor)) from = `>=${fromMajor}.0.0${options.includePrerelease ? "-0" : ""}`;
		else if (isWildcard(fromPatch)) from = `>=${fromMajor}.${fromMinor}.0${options.includePrerelease ? "-0" : ""}`;
		else if (fromPrerelease) from = `>=${from}`;
		else from = `>=${from}${options.includePrerelease ? "-0" : ""}`;
		if (isWildcard(toMajor)) to = "";
		else if (isWildcard(toMinor)) to = `<${Number(toMajor) + 1}.0.0-0`;
		else if (isWildcard(toPatch)) to = `<${toMajor}.${Number(toMinor) + 1}.0-0`;
		else if (toPrerelease) to = `<=${toMajor}.${toMinor}.${toPatch}-${toPrerelease}`;
		else if (options.includePrerelease) to = `<${toMajor}.${toMinor}.${Number(toPatch) + 1}-0`;
		else to = `<=${to}`;
		return `${from} ${to}`.trim();
	});
}
function expandComparator(comparator, options) {
	return replaceXRanges(replaceTildes(replaceCarets(comparator.replace(BUILD_SAFE, ""), options), options), options).trim().replace(STAR, "");
}
function parseSimpleRange(input, options) {
	let parts = replaceHyphenRange(input.replace(BUILD_STRIP, ""), options).replace(COMPARATOR_TRIM, "$1$2$3").replace(TILDE_TRIM, "$1~").replace(CARET_TRIM, "$1^").split(" ").map((part) => expandComparator(part, options)).join(" ").split(/\s+/).map((part) => part.trim().replace(options.includePrerelease ? GTE_ZERO_PRERELEASE : GTE_ZERO, ""));
	if (options.loose) parts = parts.filter((part) => LOOSE_COMPARATOR.test(part));
	const unique = /* @__PURE__ */ new Map();
	for (const comparator of parts.map((part) => parseComparator(part, options))) {
		if (comparator.value === "<0.0.0-0") return [comparator];
		unique.set(comparator.value, comparator);
	}
	if (unique.size > 1) unique.delete("");
	return [...unique.values()];
}
function parseRange(range, options = {}) {
	if (typeof range !== "string") return range;
	const parsedOptions = { ...options };
	const raw = range.trim().replaceAll(/\s+/g, " ");
	let sets = raw.split("||").map((part) => parseSimpleRange(part.trim(), parsedOptions)).filter((set) => set.length);
	if (!sets.length) throw new TypeError(`Range contains no valid comparator sets: ${raw}`);
	if (sets.length > 1) {
		const first = sets[0];
		sets = sets.filter((set) => set[0]?.value !== "<0.0.0-0");
		if (!sets.length) sets = [first];
		else if (sets.length > 1) {
			const any = sets.find((set) => set.length === 1 && set[0]?.value === "");
			if (any) sets = [any];
		}
	}
	return {
		normalized: sets.map((set) => set.map((comparator) => comparator.value).join(" ")).join("||"),
		options: parsedOptions,
		raw,
		sets
	};
}
function tryParseRange(range, options = {}) {
	try {
		return parseRange(range, options);
	} catch {
		return null;
	}
}
function testComparatorSet(set, version, options) {
	if (set.some((comparator) => !testParsedComparator(comparator, version))) return false;
	if (!version.prerelease?.length || options.includePrerelease) return true;
	return set.some((comparator) => {
		const allowed = comparator.version;
		return allowed !== null && allowed.prerelease?.length && allowed.major === version.major && allowed.minor === version.minor && allowed.patch === version.patch;
	});
}
function testParsedRange(range, version) {
	return range.sets.some((set) => testComparatorSet(set, version, range.options));
}
function testRangeVersion(range, version) {
	const parsed = tryParse(version, range.options);
	return parsed ? testParsedRange(range, parsed) : false;
}
function satisfies(version, range, options = {}) {
	const parsed = tryParseRange(range, options);
	return parsed ? testRangeVersion(parsed, version) : false;
}
//#endregion
//#region src/core.ts
const REVIEW_PREFIX = "review-npm-stage-";
const SENTINEL_NAME = ".review-npm-stage.json";
const REVIEW_FILE = "review.json";
const MAX_COMMAND_OUTPUT = 256 * 1024 * 1024;
const LARGE_PATCH_BYTES = 200 * 1024;
const INSTALL_SCRIPT_NAMES = [
	"preinstall",
	"install",
	"postinstall"
];
const INSTALLABLE_FIELDS = ["dependencies", "optionalDependencies"];
const BUNDLED_FIELDS = ["bundledDependencies", "bundleDependencies"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var UserError = class extends Error {
	constructor(message, options) {
		super(message, options);
		this.name = "UserError";
	}
};
var CommandError = class extends Error {
	command;
	args;
	result;
	constructor(command, args, result) {
		const rendered = [command, ...args].map(renderArg).join(" ");
		const detail = sanitizeOutput(result.stderr || result.stdout).trim();
		super(`Command failed (${result.exitCode}): ${rendered}${detail ? `\n${detail}` : ""}`);
		this.name = "CommandError";
		this.command = command;
		this.args = args;
		this.result = result;
	}
};
function renderArg(value) {
	const text = String(value);
	return /^[\w./:@=,+-]+$/.test(text) ? text : JSON.stringify(text);
}
function sanitizeOutput(value) {
	return String(value || "").replaceAll(/(npm_[A-Za-z0-9]{20,})/g, "[REDACTED_NPM_TOKEN]").replaceAll(/(Bearer\s+)[\w.~+/=-]+/gi, "$1[REDACTED]").replaceAll(/((?:_authToken|npm-otp)\s*[=:]\s*)\S+/gi, "$1[REDACTED]");
}
async function execCommand(command, args, { cwd = process$1.cwd(), allowFailure = false, maxOutput = MAX_COMMAND_OUTPUT, env = process$1.env } = {}) {
	const child = R(command, args, {
		nodePath: false,
		nodeOptions: {
			cwd,
			env,
			shell: false,
			stdio: [
				"ignore",
				"pipe",
				"pipe"
			]
		}
	});
	let outputSize = 0;
	let outputExceeded = false;
	const capture = (chunk) => {
		outputSize += chunk.length;
		if (outputSize > maxOutput && !outputExceeded) {
			outputExceeded = true;
			child.kill("SIGTERM");
		}
	};
	child.process?.stdout?.on("data", capture);
	child.process?.stderr?.on("data", capture);
	const output = await child;
	if (outputExceeded) throw new UserError(`Command output exceeded ${maxOutput} bytes: ${command} ${args.map(renderArg).join(" ")}`);
	const result = {
		exitCode: output.exitCode ?? 1,
		stdout: output.stdout,
		stderr: output.stderr
	};
	if (!allowFailure && result.exitCode !== 0) throw new CommandError(command, args, result);
	return result;
}
function parseJson(text, label) {
	try {
		return JSON.parse(text);
	} catch (error) {
		throw new UserError(`${label} did not return valid JSON: ${error instanceof Error ? error.message : String(error)}`);
	}
}
function normalizeRegistry(raw) {
	let parsed;
	try {
		parsed = new URL(raw);
	} catch {
		throw new UserError(`Invalid registry URL: ${raw}`);
	}
	if (parsed.username || parsed.password) throw new UserError("Do not place registry credentials in the registry URL; use npm configuration");
	return parsed.href;
}
function registryArg(registry) {
	return `--registry=${registry}`;
}
function numericVersionAtLeast(raw, minimum) {
	const version = tryParse(raw.replace(/^v/, ""));
	const target = {
		major: minimum[0] ?? 0,
		minor: minimum[1] ?? 0,
		patch: minimum[2] ?? 0
	};
	return version ? compare(version, target) >= 0 : false;
}
async function ensureRequirements({ workspaceMode = false } = {}) {
	if (!numericVersionAtLeast(process$1.versions.node, [
		22,
		18,
		0
	])) throw new UserError(`Node.js 22.18 or newer is required; found ${process$1.version}`);
	const npmVersion = (await execCommand("npm", ["--version"])).stdout.trim();
	if (!numericVersionAtLeast(npmVersion, [
		11,
		15,
		0
	])) throw new UserError(`npm 11.15 or newer is required; found ${npmVersion}`);
	await execCommand("tar", ["--version"]);
	let pnpmVersion = null;
	if (workspaceMode) pnpmVersion = (await execCommand("pnpm", ["--version"])).stdout.trim();
	return {
		node: process$1.version,
		npm: npmVersion,
		pnpm: pnpmVersion
	};
}
async function pathExists(path) {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}
async function readPackageManifest(path) {
	const value = parseJson(await readFile(path, "utf8"), path);
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new UserError(`${path} must contain a JSON object`);
	return value;
}
async function createReviewDirectory(outputRoot = null) {
	const parent = outputRoot ? resolve(outputRoot) : tmpdir();
	await mkdir(parent, { recursive: true });
	const directory = await mkdtemp(join(parent, REVIEW_PREFIX));
	await chmod(directory, 448);
	return await realpath(directory);
}
async function writeJson(path, value) {
	await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 384 });
}
async function computeFileHashes(path) {
	const hashes = [
		"sha1",
		"sha256",
		"sha512"
	].map((algorithm) => createHash(algorithm));
	let size = 0;
	for await (const chunk of createReadStream(path)) {
		size += chunk.length;
		for (const hash of hashes) hash.update(chunk);
	}
	const [sha1, sha256, sha512] = hashes.map((hash) => hash.digest());
	return {
		size,
		sha1: sha1.toString("hex"),
		sha256: sha256.toString("hex"),
		sha512: sha512.toString("hex"),
		integrity: `sha512-${sha512.toString("base64")}`
	};
}
//#endregion
//#region src/registry.ts
const PACKUMENT_ACCEPT = "application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*";
const REGISTRY_TIMEOUT_MS = 6e4;
const TARBALL_TIMEOUT_MS = 10 * 6e4;
function encodedPackageName(name) {
	return name.startsWith("@") ? `@${encodeURIComponent(name.slice(1))}` : encodeURIComponent(name);
}
function packageUrl(registry, name, version) {
	const path = version ? `${encodedPackageName(name)}/${encodeURIComponent(version)}` : encodedPackageName(name);
	return new URL(path, registry);
}
async function registryResponse(url, { accept = "application/json", allowNotFound = false, timeoutMs = REGISTRY_TIMEOUT_MS } = {}) {
	let response;
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	try {
		response = await fetch(url, {
			headers: { accept },
			signal: controller.signal
		});
	} catch (error) {
		clearTimeout(timeout);
		throw new UserError(`Registry request failed for ${url}: ${sanitizeOutput(error instanceof Error ? error.message : String(error))}`);
	}
	if (allowNotFound && response.status === 404) {
		clearTimeout(timeout);
		return null;
	}
	if (!response.ok) {
		let body;
		try {
			body = sanitizeOutput(await response.text()).replaceAll(/\s+/g, " ").trim().slice(0, 500);
		} finally {
			clearTimeout(timeout);
		}
		throw new UserError(`Registry request failed (${response.status}) for ${url}${body ? `: ${body}` : ""}`);
	}
	return {
		response,
		close: () => clearTimeout(timeout)
	};
}
async function registryJson(url, { accept = "application/json", allowNotFound = false } = {}) {
	const result = await registryResponse(url, {
		accept,
		allowNotFound
	});
	if (!result) return null;
	let value;
	try {
		value = await result.response.json();
	} catch (error) {
		throw new UserError(`Registry returned invalid JSON for ${url}: ${sanitizeOutput(error instanceof Error ? error.message : String(error))}`);
	} finally {
		result.close();
	}
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new UserError(`Registry returned invalid metadata for ${url}`);
	return value;
}
function tarballUrl(rawUrl) {
	let url;
	try {
		url = new URL(String(rawUrl));
	} catch {
		throw new UserError(`Invalid registry tarball URL: ${rawUrl}`);
	}
	if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new UserError(`Unsafe registry tarball URL: ${url}`);
	return url;
}
async function fetchPackagePackument(name, registry) {
	const value = await registryJson(packageUrl(registry, name), { accept: PACKUMENT_ACCEPT });
	if (!value || value.name && value.name !== name) throw new UserError(`Registry metadata identity mismatch for ${name}`);
	return value;
}
async function fetchPackageVersion(name, version, registry, { allowNotFound = false } = {}) {
	const value = await registryJson(packageUrl(registry, name, version), { allowNotFound });
	if (value && (value.name && value.name !== name || value.version && value.version !== version)) throw new UserError(`Registry metadata identity mismatch for ${name}@${version}`);
	return value;
}
async function downloadRegistryTarball(rawUrl, destination) {
	const url = tarballUrl(rawUrl);
	const result = await registryResponse(url, {
		accept: "application/octet-stream",
		timeoutMs: TARBALL_TIMEOUT_MS
	});
	if (!result?.response.body) {
		result?.close();
		throw new UserError(`Registry returned an empty tarball response for ${url}`);
	}
	try {
		await pipeline(Readable.fromWeb(result.response.body), createWriteStream(destination, {
			flags: "wx",
			mode: 384
		}));
	} catch (error) {
		await rm(destination, { force: true });
		throw new UserError(`Unable to download registry tarball ${url}: ${sanitizeOutput(error instanceof Error ? error.message : String(error))}`);
	} finally {
		result.close();
	}
	return destination;
}
//#endregion
//#region src/semver.ts
function parseSemver(raw) {
	return typeof raw === "string" ? tryParse(raw) : null;
}
function selectBaselineVersion(versions, targetVersion) {
	if (!tryParse(targetVersion)) throw new UserError(`Target version is not valid SemVer: ${targetVersion}`);
	return sortReversed(versions.filter((version) => typeof version === "string" && tryParse(version) !== null && compare(version, targetVersion) < 0))[0] ?? null;
}
function aliasTarget(name, spec) {
	if (typeof spec !== "string" || !spec.startsWith("npm:")) return {
		declaredName: name,
		packageName: name,
		range: spec
	};
	const raw = spec.slice(4);
	const separator = raw.lastIndexOf("@");
	return {
		declaredName: name,
		packageName: separator > 0 ? raw.slice(0, separator) : raw,
		range: separator > 0 ? raw.slice(separator + 1) : "*"
	};
}
function simpleRangeSatisfies(version, rawRange) {
	if (!tryParse(version) || typeof rawRange !== "string") return null;
	const range = rawRange.trim();
	if (!range || range.startsWith("workspace:")) return null;
	if (range.startsWith("npm:")) return simpleRangeSatisfies(version, aliasTarget("", range).range);
	const parsedRange = tryParseRange(range);
	return parsedRange ? satisfies(version, parsedRange) : null;
}
//#endregion
//#region src/tarballs.ts
function packageDirectoryKey(stage) {
	return `${`${stage.packageName}-${stage.version}`.replace(/^@/, "").replaceAll(/[^\w.-]+/g, "-").slice(0, 100)}-${createHash("sha256").update(stage.id).digest("hex").slice(0, 8)}`;
}
function stageTarballFilename(stage) {
	return `${stage.packageName.replace("@", "").replace("/", "-")}-${stage.version}-${stage.id}.tgz`;
}
function baselineTarballFilename(stage, version) {
	return `${stage.packageName.replace("@", "").replace("/", "-")}-${version}.tgz`;
}
function integrityMatches(expected, actual) {
	if (typeof expected !== "string" || !expected.trim()) return false;
	return expected.trim().split(/\s+/).includes(actual);
}
function validateTarPath(path) {
	if (typeof path !== "string" || !path || path.startsWith("/") || path.includes("\0") || /[\r\n]/.test(path) || path.split("/").includes("..")) throw new UserError(`Unsafe tar entry path: ${JSON.stringify(path)}`);
}
async function readTarEntryBuffer(tarball, path, maxOutput) {
	validateTarPath(path);
	return await new Promise((resolvePromise, rejectPromise) => {
		const child = spawn("tar", [
			"-xOf",
			tarball,
			"--",
			`package/${path}`
		], {
			shell: false,
			stdio: [
				"ignore",
				"pipe",
				"pipe"
			]
		});
		const stdout = [];
		const stderr = [];
		let size = 0;
		let exceeded = false;
		child.stdout.on("data", (chunk) => {
			size += chunk.length;
			if (size > maxOutput) {
				exceeded = true;
				child.kill("SIGTERM");
			} else stdout.push(chunk);
		});
		child.stderr.on("data", (chunk) => stderr.push(chunk));
		child.on("error", rejectPromise);
		child.on("close", (code) => {
			if (exceeded) {
				rejectPromise(new UserError(`Tar entry exceeds extraction limit: ${path}`));
				return;
			}
			if (code !== 0) {
				rejectPromise(new UserError(`Unable to read tar entry ${path}: ${sanitizeOutput(Buffer$1.concat(stderr))}`));
				return;
			}
			resolvePromise(Buffer$1.concat(stdout));
		});
	});
}
async function readManifestFromTarball(tarball) {
	return parseJson((await readTarEntryBuffer(tarball, "package.json", 2 * 1024 * 1024)).toString("utf8"), `${tarball}:package/package.json`);
}
function inventoryMap(files) {
	const result = /* @__PURE__ */ new Map();
	for (const item of Array.isArray(files) ? files : []) {
		if (!item || typeof item.path !== "string") continue;
		const path = item.path.replace(/^package\//, "");
		validateTarPath(path);
		result.set(path, {
			path,
			size: Number(item.size) || 0,
			mode: Number(item.mode) || 0
		});
	}
	return result;
}
async function inventoryFromTarball(tarball) {
	const output = (await execCommand("tar", ["-tf", tarball])).stdout;
	const result = /* @__PURE__ */ new Map();
	for (const rawPath of output.split(/\r?\n/)) {
		if (!rawPath || rawPath === "package" || rawPath === "package/") continue;
		if (!rawPath.startsWith("package/")) throw new UserError(`Unexpected tar entry outside package/: ${rawPath}`);
		const path = rawPath.slice(8);
		validateTarPath(path);
		if (path.endsWith("/")) continue;
		result.set(path, {
			path,
			size: 0,
			mode: 0
		});
	}
	return result;
}
function extractDownloadInfo(json, packageName) {
	if (!json || typeof json !== "object") throw new UserError("npm stage download returned no data");
	if (json[packageName]) return json[packageName];
	const values = Object.values(json);
	if (values.length === 1) return values[0];
	throw new UserError(`Unable to identify npm stage download metadata for ${packageName}`);
}
async function locateOnlyTarball(directory, preferredName) {
	const preferred = join(directory, preferredName);
	if (await pathExists(preferred)) return preferred;
	const matches = (await readdir(directory)).filter((name) => name.endsWith(".tgz")).map((name) => join(directory, name));
	if (matches.length !== 1) throw new UserError(`Expected exactly one downloaded tarball in ${directory}`);
	return matches[0];
}
async function downloadStagedTarball(stage, packageDir, registry) {
	const metadata = extractDownloadInfo(parseJson((await execCommand("npm", [
		"stage",
		"download",
		stage.id,
		"--json",
		registryArg(registry)
	], { cwd: packageDir })).stdout, "npm stage download"), stage.packageName);
	const tarball = await locateOnlyTarball(packageDir, stageTarballFilename(stage));
	const hashes = await computeFileHashes(tarball);
	const automaticApprovalBlockers = [];
	if (!stage.shasum) automaticApprovalBlockers.push("STAGED_REGISTRY_SHASUM_MISSING");
	if (metadata.name !== stage.packageName || metadata.version !== stage.version) automaticApprovalBlockers.push("STAGED_DOWNLOAD_IDENTITY_MISMATCH");
	if (stage.shasum && hashes.sha1 !== stage.shasum) automaticApprovalBlockers.push("STAGED_SHASUM_MISMATCH");
	if (metadata.shasum && hashes.sha1 !== metadata.shasum) automaticApprovalBlockers.push("STAGED_DOWNLOAD_SHASUM_MISMATCH");
	const manifest = await readManifestFromTarball(tarball);
	if (manifest.name !== stage.packageName || manifest.version !== stage.version) automaticApprovalBlockers.push("STAGED_MANIFEST_IDENTITY_MISMATCH");
	return {
		tarball,
		metadata,
		hashes,
		manifest,
		inventory: inventoryMap(metadata.files),
		automaticApprovalBlockers
	};
}
async function createSyntheticBaseline(stage, packageDir) {
	const root = join(packageDir, "synthetic-baseline");
	const packageRoot = join(root, "package");
	await mkdir(packageRoot, {
		recursive: true,
		mode: 448
	});
	await writeJson(join(packageRoot, "package.json"), {
		name: stage.packageName,
		version: "0.0.0"
	});
	const tarball = join(packageDir, "synthetic-empty-baseline.tgz");
	await execCommand("tar", [
		"-czf",
		tarball,
		"-C",
		root,
		"package"
	]);
	return {
		version: null,
		tarball,
		manifest: {
			name: stage.packageName,
			version: "0.0.0"
		},
		inventory: /* @__PURE__ */ new Map([["package.json", {
			path: "package.json",
			size: 0,
			mode: 420
		}]]),
		integrity: null,
		synthetic: true,
		automaticApprovalBlockers: ["NO_PUBLISHED_BASELINE"]
	};
}
async function downloadBaselineTarball(stage, packageDir, registry) {
	const packument = await fetchPackagePackument(stage.packageName, registry);
	const version = selectBaselineVersion(packument.versions && typeof packument.versions === "object" && !Array.isArray(packument.versions) ? Object.keys(packument.versions) : [], stage.version);
	if (!version) return await createSyntheticBaseline(stage, packageDir);
	const dist = packument.versions[version]?.dist;
	if (!dist || typeof dist.tarball !== "string") throw new UserError(`Registry metadata has no tarball URL for ${stage.packageName}@${version}`);
	const tarball = join(packageDir, baselineTarballFilename(stage, version));
	await downloadRegistryTarball(dist.tarball, tarball);
	const hashes = await computeFileHashes(tarball);
	const automaticApprovalBlockers = [];
	if (!(dist && (typeof dist.shasum === "string" || typeof dist.integrity === "string"))) automaticApprovalBlockers.push("BASELINE_REGISTRY_HASH_MISSING");
	if (dist?.shasum && dist.shasum !== hashes.sha1) automaticApprovalBlockers.push("BASELINE_REGISTRY_SHASUM_MISMATCH");
	if (dist?.integrity && !integrityMatches(dist.integrity, hashes.integrity)) automaticApprovalBlockers.push("BASELINE_REGISTRY_INTEGRITY_MISMATCH");
	const manifest = await readManifestFromTarball(tarball);
	if (manifest.name !== stage.packageName || manifest.version !== version) automaticApprovalBlockers.push("BASELINE_MANIFEST_IDENTITY_MISMATCH");
	return {
		version,
		tarball,
		manifest,
		inventory: await inventoryFromTarball(tarball),
		integrity: {
			registry: {
				shasum: dist?.shasum ?? null,
				integrity: dist?.integrity ?? null,
				tarball: dist?.tarball ?? null
			},
			local: hashes
		},
		synthetic: false,
		automaticApprovalBlockers
	};
}
function classifyFileChanges(baseInventory, targetInventory, changedNames) {
	return {
		added: [...targetInventory.keys()].filter((path) => !baseInventory.has(path)).toSorted(),
		removed: [...baseInventory.keys()].filter((path) => !targetInventory.has(path)).toSorted(),
		changed: changedNames.filter((path) => baseInventory.has(path) && targetInventory.has(path)).toSorted()
	};
}
async function produceDiff(baseTarball, targetTarball, packageDir) {
	const common = [`--diff=${baseTarball}`, `--diff=${targetTarball}`];
	const changedNames = (await execCommand("npm", [
		"diff",
		...common,
		"--diff-name-only"
	], { cwd: packageDir })).stdout.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
	const patchResult = await execCommand("npm", [
		"diff",
		...common,
		"--diff-unified=3"
	], { cwd: packageDir });
	const patchPath = join(packageDir, "diff.patch");
	await writeFile(patchPath, patchResult.stdout, { mode: 384 });
	const namesPath = join(packageDir, "changed-files.txt");
	await writeFile(namesPath, `${changedNames.join("\n")}${changedNames.length ? "\n" : ""}`, { mode: 384 });
	const patchBuffer = Buffer$1.from(patchResult.stdout);
	return {
		changedNames,
		patchPath,
		namesPath,
		bytes: patchBuffer.length,
		sha256: createHash("sha256").update(patchBuffer).digest("hex"),
		large: patchBuffer.length > LARGE_PATCH_BYTES
	};
}
//#endregion
//#region src/package-review.ts
function bundledNames(manifest) {
	for (const field of BUNDLED_FIELDS) if (Array.isArray(manifest?.[field])) return manifest[field].filter((name) => typeof name === "string");
	return [];
}
function installableDependencyMap(manifest) {
	const map = /* @__PURE__ */ new Map();
	for (const field of INSTALLABLE_FIELDS) {
		const values = manifest?.[field];
		if (!values || typeof values !== "object" || Array.isArray(values)) continue;
		for (const [name, spec] of Object.entries(values)) {
			const existing = map.get(name) || {
				name,
				spec: String(spec),
				fields: []
			};
			existing.spec = String(spec);
			existing.fields.push(field);
			map.set(name, existing);
		}
	}
	for (const name of bundledNames(manifest)) {
		const existing = map.get(name) || {
			name,
			spec: null,
			fields: []
		};
		existing.fields.push("bundledDependencies");
		map.set(name, existing);
	}
	return map;
}
function fieldDependencyMap(manifest, field) {
	const value = manifest?.[field];
	return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function diffNamedSpecs(base, target) {
	const added = [];
	const removed = [];
	const updated = [];
	for (const [name, spec] of Object.entries(target)) if (!(name in base)) added.push({
		name,
		spec
	});
	else if (String(base[name]) !== String(spec)) updated.push({
		name,
		before: String(base[name]),
		after: String(spec)
	});
	for (const [name, spec] of Object.entries(base)) if (!(name in target)) removed.push({
		name,
		spec
	});
	const byName = (a, b) => a.name.localeCompare(b.name, "en");
	return {
		added: added.toSorted(byName),
		removed: removed.toSorted(byName),
		updated: updated.toSorted(byName)
	};
}
function classifyDependencyDelta(baseManifest, targetManifest) {
	const baseInstallable = installableDependencyMap(baseManifest);
	const targetInstallable = installableDependencyMap(targetManifest);
	const added = [];
	const removed = [];
	const updated = [];
	for (const [name, entry] of targetInstallable) {
		const before = baseInstallable.get(name);
		if (!before) added.push(entry);
		else if (before.spec !== entry.spec || before.fields.join("\0") !== entry.fields.join("\0")) updated.push({
			name,
			before: {
				spec: before.spec,
				fields: before.fields
			},
			after: {
				spec: entry.spec,
				fields: entry.fields
			}
		});
	}
	for (const [name, entry] of baseInstallable) if (!targetInstallable.has(name)) removed.push(entry);
	const byName = (a, b) => a.name.localeCompare(b.name, "en");
	return {
		installable: {
			added: added.toSorted(byName),
			removed: removed.toSorted(byName),
			updated: updated.toSorted(byName)
		},
		peerDependencies: diffNamedSpecs(fieldDependencyMap(baseManifest, "peerDependencies"), fieldDependencyMap(targetManifest, "peerDependencies")),
		devDependencies: diffNamedSpecs(fieldDependencyMap(baseManifest, "devDependencies"), fieldDependencyMap(targetManifest, "devDependencies"))
	};
}
async function collectPackage(stage, reviewDir, registry) {
	const key = packageDirectoryKey(stage);
	const packageDir = join(reviewDir, "packages", key);
	await mkdir(packageDir, {
		recursive: true,
		mode: 448
	});
	const stagedDir = join(packageDir, "staged");
	const baselineDir = join(packageDir, "baseline");
	await Promise.all([mkdir(stagedDir, {
		recursive: true,
		mode: 448
	}), mkdir(baselineDir, {
		recursive: true,
		mode: 448
	})]);
	const [staged, baseline] = await Promise.all([downloadStagedTarball(stage, stagedDir, registry), downloadBaselineTarball(stage, baselineDir, registry)]);
	await writeJson(join(packageDir, "staged-package.json"), staged.manifest);
	await writeJson(join(packageDir, "baseline-package.json"), baseline.manifest);
	const diff = await produceDiff(baseline.tarball, staged.tarball, packageDir);
	const fileChanges = classifyFileChanges(baseline.inventory, staged.inventory, diff.changedNames);
	const dependencyDelta = classifyDependencyDelta(baseline.manifest, staged.manifest);
	const automaticApprovalBlockers = [...staged.automaticApprovalBlockers, ...baseline.automaticApprovalBlockers];
	return {
		key,
		packageDir,
		stage,
		baseline: {
			version: baseline.version,
			synthetic: baseline.synthetic,
			integrity: baseline.integrity
		},
		staged: { integrity: {
			stageShasum: stage.shasum,
			downloadShasum: staged.metadata.shasum ?? null,
			local: staged.hashes
		} },
		targetManifest: staged.manifest,
		baselineManifest: baseline.manifest,
		artifacts: {
			packageDir,
			patch: diff.patchPath,
			changedFiles: diff.namesPath,
			stagedManifest: join(packageDir, "staged-package.json"),
			baselineManifest: join(packageDir, "baseline-package.json"),
			stagedTarball: staged.tarball,
			baselineTarball: baseline.tarball,
			audit: join(packageDir, "dependency-audit.json")
		},
		patch: {
			bytes: diff.bytes,
			sha256: diff.sha256,
			large: diff.large
		},
		fileChanges,
		dependencyDelta,
		dependencyReview: null,
		automaticApprovalBlockers: [...new Set(automaticApprovalBlockers)].toSorted()
	};
}
//#endregion
//#region src/dependencies.ts
function isRegistryDependencySpec(spec) {
	if (typeof spec !== "string" || !spec.trim()) return false;
	return !/^(?:workspace:|file:|link:|git(?:\+|:)|https?:|github:|gitlab:|bitbucket:|\.{0,2}\/)/i.test(spec.trim());
}
function installLifecycleScripts(scripts) {
	if (!scripts || typeof scripts !== "object") return {};
	const record = scripts;
	return Object.fromEntries(INSTALL_SCRIPT_NAMES.filter((name) => typeof record[name] === "string").map((name) => [name, record[name]]));
}
async function packageVersionPublished(name, version, registry) {
	try {
		return Boolean(await fetchPackageVersion(name, version, registry, { allowNotFound: true }));
	} catch {
		return false;
	}
}
function auditVulnerabilityCount(audit) {
	const vulnerabilities = audit?.metadata?.vulnerabilities;
	if (!vulnerabilities || typeof vulnerabilities !== "object") return null;
	return Object.entries(vulnerabilities).filter(([key]) => key !== "total").reduce((sum, [, value]) => sum + (Number(value) || 0), 0);
}
function dependencyAuditBlockers(audit, exitCode) {
	const vulnerabilityCount = auditVulnerabilityCount(audit);
	if (audit?.error) return ["DEPENDENCY_AUDIT_FAILED"];
	if (vulnerabilityCount === null) return ["DEPENDENCY_AUDIT_INCOMPLETE"];
	if (vulnerabilityCount > 0) return ["DEPENDENCY_VULNERABILITIES_FOUND"];
	if (exitCode !== 0) return ["DEPENDENCY_AUDIT_FAILED"];
	return [];
}
async function collectDependencyMetadata(name, version, registry) {
	let metadata;
	try {
		metadata = await fetchPackageVersion(name, version, registry, { allowNotFound: true });
	} catch (error) {
		return { error: sanitizeOutput(error instanceof Error ? error.message : String(error)).trim() };
	}
	if (!metadata) return { error: `Registry metadata not found for ${name}@${version}` };
	return {
		name: metadata.name ?? name,
		version: metadata.version ?? version,
		description: metadata.description ?? null,
		license: metadata.license ?? null,
		deprecated: metadata.deprecated ?? null,
		repository: metadata.repository ?? null,
		maintainers: metadata.maintainers ?? [],
		dist: metadata.dist ?? null,
		scripts: metadata.scripts ?? {},
		installLifecycleScripts: installLifecycleScripts(metadata?.scripts)
	};
}
async function auditExternalDependencies(pkg, dependencies, registry) {
	const auditDir = join(pkg.packageDir, "dependency-audit");
	await mkdir(auditDir, {
		recursive: true,
		mode: 448
	});
	const dependencyObject = Object.fromEntries(dependencies.map((item) => [item.name, item.spec]));
	await writeJson(join(auditDir, "package.json"), {
		name: "review-npm-stage-dependency-audit",
		version: "0.0.0",
		private: true,
		dependencies: dependencyObject
	});
	const install = await execCommand("npm", [
		"install",
		"--package-lock-only",
		"--ignore-scripts",
		"--no-fund",
		"--no-audit",
		"--package-lock=true",
		registryArg(registry)
	], {
		cwd: auditDir,
		allowFailure: true
	});
	const result = {
		install: {
			succeeded: install.exitCode === 0,
			error: install.exitCode === 0 ? null : sanitizeOutput(install.stderr || install.stdout).trim()
		},
		audit: null,
		dependencies: []
	};
	const automaticApprovalBlockers = [];
	if (install.exitCode !== 0) {
		automaticApprovalBlockers.push("DEPENDENCY_RESOLUTION_FAILED");
		return {
			result,
			automaticApprovalBlockers
		};
	}
	const lock = JSON.parse(await readFile(join(auditDir, "package-lock.json"), "utf8"));
	const auditCommand = await execCommand("npm", [
		"audit",
		"--json",
		registryArg(registry)
	], {
		cwd: auditDir,
		allowFailure: true
	});
	try {
		result.audit = JSON.parse(auditCommand.stdout);
	} catch (error) {
		result.audit = { error: error instanceof Error ? error.message : String(error) };
	}
	automaticApprovalBlockers.push(...dependencyAuditBlockers(result.audit, auditCommand.exitCode));
	for (const dependency of dependencies) {
		const lockEntry = lock.packages?.[`node_modules/${dependency.name}`];
		if (!lockEntry?.version) {
			result.dependencies.push({
				...dependency,
				error: "Direct dependency was not found in package-lock.json"
			});
			automaticApprovalBlockers.push(`DEPENDENCY_LOCK_ENTRY_MISSING:${dependency.name}`);
			continue;
		}
		const target = aliasTarget(dependency.name, dependency.spec);
		const resolvedName = lockEntry.name || target.packageName;
		const metadata = await collectDependencyMetadata(resolvedName, lockEntry.version, registry);
		if (metadata.error) automaticApprovalBlockers.push(`DEPENDENCY_METADATA_FAILED:${dependency.name}`);
		if (metadata.deprecated) automaticApprovalBlockers.push(`DEPENDENCY_DEPRECATED:${dependency.name}`);
		if (metadata.installLifecycleScripts && Object.keys(metadata.installLifecycleScripts).length > 0) automaticApprovalBlockers.push(`DEPENDENCY_INSTALL_SCRIPT_REQUIRES_REVIEW:${dependency.name}`);
		result.dependencies.push({
			...dependency,
			resolvedName,
			resolvedVersion: lockEntry.version,
			integrity: lockEntry.integrity ?? null,
			metadata
		});
	}
	return {
		result,
		automaticApprovalBlockers
	};
}
function allRuntimeDependencyEntries(manifest) {
	const entries = [];
	for (const field of [...INSTALLABLE_FIELDS, "peerDependencies"]) {
		const values = fieldDependencyMap(manifest, field);
		for (const [name, spec] of Object.entries(values)) entries.push({
			name,
			spec: String(spec),
			field
		});
	}
	return entries;
}
function buildApprovalOrder(packages) {
	const packageByName = new Map(packages.map((pkg) => [pkg.stage.packageName, pkg]));
	const names = new Set(packageByName.keys());
	const edges = [];
	for (const pkg of packages) for (const dependency of allRuntimeDependencyEntries(pkg.targetManifest)) {
		const target = aliasTarget(dependency.name, dependency.spec);
		if (target.packageName !== pkg.stage.packageName && names.has(target.packageName)) {
			const targetPackage = packageByName.get(target.packageName);
			edges.push({
				from: target.packageName,
				to: pkg.stage.packageName,
				field: dependency.field,
				spec: dependency.spec,
				rangeSatisfied: simpleRangeSatisfies(targetPackage.stage.version, target.range)
			});
		}
	}
	const uniqueEdges = [...new Map(edges.map((edge) => [`${edge.from}\0${edge.to}`, edge])).values()].toSorted((a, b) => `${a.from}\0${a.to}`.localeCompare(`${b.from}\0${b.to}`, "en"));
	const outgoing = new Map(packages.map((pkg) => [pkg.stage.packageName, []]));
	const indegree = new Map(packages.map((pkg) => [pkg.stage.packageName, 0]));
	for (const edge of uniqueEdges) {
		outgoing.get(edge.from).push(edge.to);
		indegree.set(edge.to, indegree.get(edge.to) + 1);
	}
	const ready = [...indegree].filter(([, value]) => value === 0).map(([name]) => name).toSorted((a, b) => a.localeCompare(b, "en"));
	const order = [];
	while (ready.length > 0) {
		const name = ready.shift();
		order.push(name);
		for (const next of outgoing.get(name).toSorted((a, b) => a.localeCompare(b, "en"))) {
			indegree.set(next, indegree.get(next) - 1);
			if (indegree.get(next) === 0) {
				ready.push(next);
				ready.sort((a, b) => a.localeCompare(b, "en"));
			}
		}
	}
	const cycle = order.length !== packages.length;
	return {
		edges: uniqueEdges,
		cycle,
		cycleMembers: cycle ? [...indegree].filter(([, value]) => value > 0).map(([name]) => name).toSorted((a, b) => a.localeCompare(b, "en")) : [],
		order: cycle ? packages.map((pkg) => pkg.stage.packageName).toSorted((a, b) => a.localeCompare(b, "en")) : order
	};
}
async function analyzePackageDependencies(pkg, packageByName, workspaceByName, registry) {
	const internal = [];
	const external = [];
	const workspace = [];
	const nonRegistry = [];
	const automaticApprovalBlockers = [];
	for (const dependency of pkg.dependencyDelta.installable.added) {
		const target = aliasTarget(dependency.name, dependency.spec);
		if (packageByName.has(target.packageName)) {
			const stagedVersion = packageByName.get(target.packageName).stage.version;
			const rangeSatisfied = simpleRangeSatisfies(stagedVersion, target.range);
			internal.push({
				...dependency,
				packageName: target.packageName,
				stagedVersion,
				rangeSatisfied
			});
			if (rangeSatisfied !== true) automaticApprovalBlockers.push(`${rangeSatisfied === false ? "INTERNAL_DEPENDENCY_RANGE_MISMATCH" : "INTERNAL_DEPENDENCY_RANGE_UNVERIFIED"}:${dependency.name}`);
			continue;
		}
		if (workspaceByName.has(target.packageName)) {
			const project = workspaceByName.get(target.packageName);
			const published = project.version && project.name && await packageVersionPublished(project.name, project.version, registry);
			workspace.push({
				...dependency,
				packageName: target.packageName,
				workspaceVersion: project.version,
				published: Boolean(published)
			});
			if (!published) automaticApprovalBlockers.push(`UNPUBLISHED_WORKSPACE_DEPENDENCY:${target.packageName}`);
			continue;
		}
		if (!isRegistryDependencySpec(dependency.spec)) {
			nonRegistry.push(dependency);
			automaticApprovalBlockers.push(`NON_REGISTRY_DEPENDENCY:${dependency.name}`);
			continue;
		}
		external.push(dependency);
	}
	let audit = {
		install: {
			succeeded: true,
			error: null
		},
		audit: { metadata: { vulnerabilities: {} } },
		dependencies: []
	};
	if (external.length > 0) {
		const auditResult = await auditExternalDependencies(pkg, external, registry);
		audit = auditResult.result;
		automaticApprovalBlockers.push(...auditResult.automaticApprovalBlockers);
	}
	const review = {
		internal,
		workspace,
		external,
		nonRegistry,
		audit
	};
	await writeJson(pkg.artifacts.audit, review);
	pkg.dependencyReview = review;
	pkg.automaticApprovalBlockers = [.../* @__PURE__ */ new Set([...pkg.automaticApprovalBlockers, ...automaticApprovalBlockers])].toSorted();
}
//#endregion
//#region node_modules/.pnpm/is-docker@3.0.0/node_modules/is-docker/index.js
let isDockerCached;
function hasDockerEnv() {
	try {
		fs$1.statSync("/.dockerenv");
		return true;
	} catch {
		return false;
	}
}
function hasDockerCGroup() {
	try {
		return fs$1.readFileSync("/proc/self/cgroup", "utf8").includes("docker");
	} catch {
		return false;
	}
}
function isDocker() {
	if (isDockerCached === void 0) isDockerCached = hasDockerEnv() || hasDockerCGroup();
	return isDockerCached;
}
//#endregion
//#region node_modules/.pnpm/is-inside-container@1.0.0/node_modules/is-inside-container/index.js
let cachedResult;
const hasContainerEnv = () => {
	try {
		fs$1.statSync("/run/.containerenv");
		return true;
	} catch {
		return false;
	}
};
function isInsideContainer() {
	if (cachedResult === void 0) cachedResult = hasContainerEnv() || isDocker();
	return cachedResult;
}
//#endregion
//#region node_modules/.pnpm/is-wsl@3.1.1/node_modules/is-wsl/index.js
const isWsl = () => {
	if (process$1.platform !== "linux") return false;
	if (os.release().toLowerCase().includes("microsoft")) {
		if (isInsideContainer()) return false;
		return true;
	}
	try {
		if (fs$1.readFileSync("/proc/version", "utf8").toLowerCase().includes("microsoft")) return !isInsideContainer();
	} catch {}
	if (fs$1.existsSync("/proc/sys/fs/binfmt_misc/WSLInterop") || fs$1.existsSync("/run/WSL")) return !isInsideContainer();
	return false;
};
var is_wsl_default = process$1.env.__IS_WSL_TEST__ ? isWsl : isWsl();
//#endregion
//#region node_modules/.pnpm/powershell-utils@0.1.0/node_modules/powershell-utils/index.js
const execFile$2 = promisify(childProcess.execFile);
const powerShellPath$1 = () => `${process$1.env.SYSTEMROOT || process$1.env.windir || String.raw`C:\Windows`}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
const executePowerShell = async (command, options = {}) => {
	const { powerShellPath: psPath, ...execFileOptions } = options;
	const encodedCommand = executePowerShell.encodeCommand(command);
	return execFile$2(psPath ?? powerShellPath$1(), [...executePowerShell.argumentsPrefix, encodedCommand], {
		encoding: "utf8",
		...execFileOptions
	});
};
executePowerShell.argumentsPrefix = [
	"-NoProfile",
	"-NonInteractive",
	"-ExecutionPolicy",
	"Bypass",
	"-EncodedCommand"
];
executePowerShell.encodeCommand = (command) => Buffer$1.from(command, "utf16le").toString("base64");
executePowerShell.escapeArgument = (value) => `'${String(value).replaceAll("'", "''")}'`;
//#endregion
//#region node_modules/.pnpm/wsl-utils@0.3.1/node_modules/wsl-utils/utilities.js
function parseMountPointFromConfig(content) {
	for (const line of content.split("\n")) {
		if (/^\s*#/.test(line)) continue;
		const match = /^\s*root\s*=\s*(?<mountPoint>"[^"]*"|'[^']*'|[^#]*)/.exec(line);
		if (!match) continue;
		return match.groups.mountPoint.trim().replaceAll(/^["']|["']$/g, "");
	}
}
//#endregion
//#region node_modules/.pnpm/wsl-utils@0.3.1/node_modules/wsl-utils/index.js
const execFile$1 = promisify(childProcess.execFile);
const wslDrivesMountPoint = (() => {
	const defaultMountPoint = "/mnt/";
	let mountPoint;
	return async function() {
		if (mountPoint) return mountPoint;
		const configFilePath = "/etc/wsl.conf";
		let isConfigFileExists = false;
		try {
			await fs.access(configFilePath, constants.F_OK);
			isConfigFileExists = true;
		} catch {}
		if (!isConfigFileExists) return defaultMountPoint;
		const parsedMountPoint = parseMountPointFromConfig(await fs.readFile(configFilePath, { encoding: "utf8" }));
		if (parsedMountPoint === void 0) return defaultMountPoint;
		mountPoint = parsedMountPoint;
		mountPoint = mountPoint.endsWith("/") ? mountPoint : `${mountPoint}/`;
		return mountPoint;
	};
})();
const powerShellPathFromWsl = async () => {
	return `${await wslDrivesMountPoint()}c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe`;
};
const powerShellPath = is_wsl_default ? powerShellPathFromWsl : powerShellPath$1;
let canAccessPowerShellPromise;
const canAccessPowerShell = async () => {
	canAccessPowerShellPromise ??= (async () => {
		try {
			const psPath = await powerShellPath();
			await fs.access(psPath, constants.X_OK);
			return true;
		} catch {
			return false;
		}
	})();
	return canAccessPowerShellPromise;
};
const wslDefaultBrowser = async () => {
	const psPath = await powerShellPath();
	const { stdout } = await executePowerShell(String.raw`(Get-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice").ProgId`, { powerShellPath: psPath });
	return stdout.trim();
};
const convertWslPathToWindows = async (path) => {
	if (/^[a-z]+:\/\//i.test(path)) return path;
	try {
		const { stdout } = await execFile$1("wslpath", ["-aw", path], { encoding: "utf8" });
		return stdout.trim();
	} catch {
		return path;
	}
};
//#endregion
//#region node_modules/.pnpm/define-lazy-prop@3.0.0/node_modules/define-lazy-prop/index.js
function defineLazyProperty(object, propertyName, valueGetter) {
	const define = (value) => Object.defineProperty(object, propertyName, {
		value,
		enumerable: true,
		writable: true
	});
	Object.defineProperty(object, propertyName, {
		configurable: true,
		enumerable: true,
		get() {
			const result = valueGetter();
			define(result);
			return result;
		},
		set(value) {
			define(value);
		}
	});
	return object;
}
//#endregion
//#region node_modules/.pnpm/default-browser-id@5.0.1/node_modules/default-browser-id/index.js
const execFileAsync$3 = promisify(execFile);
async function defaultBrowserId() {
	if (process$1.platform !== "darwin") throw new Error("macOS only");
	const { stdout } = await execFileAsync$3("defaults", [
		"read",
		"com.apple.LaunchServices/com.apple.launchservices.secure",
		"LSHandlers"
	]);
	const browserId = /LSHandlerRoleAll = "(?!-)(?<id>[^"]+?)";\s+?LSHandlerURLScheme = (?:http|https);/.exec(stdout)?.groups.id ?? "com.apple.Safari";
	if (browserId === "com.apple.safari") return "com.apple.Safari";
	return browserId;
}
//#endregion
//#region node_modules/.pnpm/run-applescript@7.1.0/node_modules/run-applescript/index.js
const execFileAsync$2 = promisify(execFile);
async function runAppleScript(script, { humanReadableOutput = true, signal } = {}) {
	if (process$1.platform !== "darwin") throw new Error("macOS only");
	const outputArguments = humanReadableOutput ? [] : ["-ss"];
	const execOptions = {};
	if (signal) execOptions.signal = signal;
	const { stdout } = await execFileAsync$2("osascript", [
		"-e",
		script,
		outputArguments
	], execOptions);
	return stdout.trim();
}
//#endregion
//#region node_modules/.pnpm/bundle-name@4.1.0/node_modules/bundle-name/index.js
async function bundleName(bundleId) {
	return runAppleScript(`tell application "Finder" to set app_path to application file id "${bundleId}" as string\ntell application "System Events" to get value of property list item "CFBundleName" of property list file (app_path & ":Contents:Info.plist")`);
}
//#endregion
//#region node_modules/.pnpm/default-browser@5.5.0/node_modules/default-browser/windows.js
const execFileAsync$1 = promisify(execFile);
const windowsBrowserProgIds = {
	MSEdgeHTM: {
		name: "Edge",
		id: "com.microsoft.edge"
	},
	MSEdgeBHTML: {
		name: "Edge Beta",
		id: "com.microsoft.edge.beta"
	},
	MSEdgeDHTML: {
		name: "Edge Dev",
		id: "com.microsoft.edge.dev"
	},
	AppXq0fevzme2pys62n3e0fbqa7peapykr8v: {
		name: "Edge",
		id: "com.microsoft.edge.old"
	},
	ChromeHTML: {
		name: "Chrome",
		id: "com.google.chrome"
	},
	ChromeBHTML: {
		name: "Chrome Beta",
		id: "com.google.chrome.beta"
	},
	ChromeDHTML: {
		name: "Chrome Dev",
		id: "com.google.chrome.dev"
	},
	ChromiumHTM: {
		name: "Chromium",
		id: "org.chromium.Chromium"
	},
	BraveHTML: {
		name: "Brave",
		id: "com.brave.Browser"
	},
	BraveBHTML: {
		name: "Brave Beta",
		id: "com.brave.Browser.beta"
	},
	BraveDHTML: {
		name: "Brave Dev",
		id: "com.brave.Browser.dev"
	},
	BraveSSHTM: {
		name: "Brave Nightly",
		id: "com.brave.Browser.nightly"
	},
	FirefoxURL: {
		name: "Firefox",
		id: "org.mozilla.firefox"
	},
	OperaStable: {
		name: "Opera",
		id: "com.operasoftware.Opera"
	},
	VivaldiHTM: {
		name: "Vivaldi",
		id: "com.vivaldi.Vivaldi"
	},
	"IE.HTTP": {
		name: "Internet Explorer",
		id: "com.microsoft.ie"
	}
};
const _windowsBrowserProgIdMap = new Map(Object.entries(windowsBrowserProgIds));
var UnknownBrowserError = class extends Error {};
async function defaultBrowser$1(_execFileAsync = execFileAsync$1) {
	const { stdout } = await _execFileAsync("reg", [
		"QUERY",
		" HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\http\\UserChoice",
		"/v",
		"ProgId"
	]);
	const match = /ProgId\s*REG_SZ\s*(?<id>\S+)/.exec(stdout);
	if (!match) throw new UnknownBrowserError(`Cannot find Windows browser in stdout: ${JSON.stringify(stdout)}`);
	const { id } = match.groups;
	const dotIndex = id.lastIndexOf(".");
	const hyphenIndex = id.lastIndexOf("-");
	const baseIdByDot = dotIndex === -1 ? void 0 : id.slice(0, dotIndex);
	const baseIdByHyphen = hyphenIndex === -1 ? void 0 : id.slice(0, hyphenIndex);
	return windowsBrowserProgIds[id] ?? windowsBrowserProgIds[baseIdByDot] ?? windowsBrowserProgIds[baseIdByHyphen] ?? {
		name: id,
		id
	};
}
//#endregion
//#region node_modules/.pnpm/default-browser@5.5.0/node_modules/default-browser/index.js
const execFileAsync = promisify(execFile);
const titleize = (string) => string.toLowerCase().replaceAll(/(?:^|\s|-)\S/g, (x) => x.toUpperCase());
async function defaultBrowser() {
	if (process$1.platform === "darwin") {
		const id = await defaultBrowserId();
		return {
			name: await bundleName(id),
			id
		};
	}
	if (process$1.platform === "linux") {
		const { stdout } = await execFileAsync("xdg-mime", [
			"query",
			"default",
			"x-scheme-handler/http"
		]);
		const id = stdout.trim();
		return {
			name: titleize(id.replace(/.desktop$/, "").replace("-", " ")),
			id
		};
	}
	if (process$1.platform === "win32") return defaultBrowser$1();
	throw new Error("Only macOS, Linux, and Windows are supported");
}
//#endregion
//#region node_modules/.pnpm/is-in-ssh@1.0.0/node_modules/is-in-ssh/index.js
const isInSsh = Boolean(process$1.env.SSH_CONNECTION || process$1.env.SSH_CLIENT || process$1.env.SSH_TTY);
//#endregion
//#region node_modules/.pnpm/open@11.0.0/node_modules/open/index.js
const fallbackAttemptSymbol = Symbol("fallbackAttempt");
const __dirname = import.meta.url ? path.dirname(fileURLToPath(import.meta.url)) : "";
const localXdgOpenPath = path.join(__dirname, "xdg-open");
const { platform, arch } = process$1;
const tryEachApp = async (apps, opener) => {
	if (apps.length === 0) return;
	const errors = [];
	for (const app of apps) try {
		return await opener(app);
	} catch (error) {
		errors.push(error);
	}
	throw new AggregateError(errors, "Failed to open in all supported apps");
};
const baseOpen = async (options) => {
	options = {
		wait: false,
		background: false,
		newInstance: false,
		allowNonzeroExitCode: false,
		...options
	};
	const isFallbackAttempt = options[fallbackAttemptSymbol] === true;
	delete options[fallbackAttemptSymbol];
	if (Array.isArray(options.app)) return tryEachApp(options.app, (singleApp) => baseOpen({
		...options,
		app: singleApp,
		[fallbackAttemptSymbol]: true
	}));
	let { name: app, arguments: appArguments = [] } = options.app ?? {};
	appArguments = [...appArguments];
	if (Array.isArray(app)) return tryEachApp(app, (appName) => baseOpen({
		...options,
		app: {
			name: appName,
			arguments: appArguments
		},
		[fallbackAttemptSymbol]: true
	}));
	if (app === "browser" || app === "browserPrivate") {
		const ids = {
			"com.google.chrome": "chrome",
			"google-chrome.desktop": "chrome",
			"com.brave.browser": "brave",
			"org.mozilla.firefox": "firefox",
			"firefox.desktop": "firefox",
			"com.microsoft.msedge": "edge",
			"com.microsoft.edge": "edge",
			"com.microsoft.edgemac": "edge",
			"microsoft-edge.desktop": "edge",
			"com.apple.safari": "safari"
		};
		const flags = {
			chrome: "--incognito",
			brave: "--incognito",
			firefox: "--private-window",
			edge: "--inPrivate"
		};
		let browser;
		if (is_wsl_default) {
			const progId = await wslDefaultBrowser();
			browser = _windowsBrowserProgIdMap.get(progId) ?? {};
		} else browser = await defaultBrowser();
		if (browser.id in ids) {
			const browserName = ids[browser.id.toLowerCase()];
			if (app === "browserPrivate") {
				if (browserName === "safari") throw new Error("Safari doesn't support opening in private mode via command line");
				appArguments.push(flags[browserName]);
			}
			return baseOpen({
				...options,
				app: {
					name: apps[browserName],
					arguments: appArguments
				}
			});
		}
		throw new Error(`${browser.name} is not supported as a default browser`);
	}
	let command;
	const cliArguments = [];
	const childProcessOptions = {};
	let shouldUseWindowsInWsl = false;
	if (is_wsl_default && !isInsideContainer() && !isInSsh && !app) shouldUseWindowsInWsl = await canAccessPowerShell();
	if (platform === "darwin") {
		command = "open";
		if (options.wait) cliArguments.push("--wait-apps");
		if (options.background) cliArguments.push("--background");
		if (options.newInstance) cliArguments.push("--new");
		if (app) cliArguments.push("-a", app);
	} else if (platform === "win32" || shouldUseWindowsInWsl) {
		command = await powerShellPath();
		cliArguments.push(...executePowerShell.argumentsPrefix);
		if (!is_wsl_default) childProcessOptions.windowsVerbatimArguments = true;
		if (is_wsl_default && options.target) options.target = await convertWslPathToWindows(options.target);
		const encodedArguments = ["$ProgressPreference = 'SilentlyContinue';", "Start"];
		if (options.wait) encodedArguments.push("-Wait");
		if (app) {
			encodedArguments.push(executePowerShell.escapeArgument(app));
			if (options.target) appArguments.push(options.target);
		} else if (options.target) encodedArguments.push(executePowerShell.escapeArgument(options.target));
		if (appArguments.length > 0) {
			appArguments = appArguments.map((argument) => executePowerShell.escapeArgument(argument));
			encodedArguments.push("-ArgumentList", appArguments.join(","));
		}
		options.target = executePowerShell.encodeCommand(encodedArguments.join(" "));
		if (!options.wait) childProcessOptions.stdio = "ignore";
	} else {
		if (app) command = app;
		else {
			const isBundled = !__dirname || __dirname === "/";
			let exeLocalXdgOpen = false;
			try {
				await fs.access(localXdgOpenPath, constants.X_OK);
				exeLocalXdgOpen = true;
			} catch {}
			command = process$1.versions.electron ?? (platform === "android" || isBundled || !exeLocalXdgOpen) ? "xdg-open" : localXdgOpenPath;
		}
		if (appArguments.length > 0) cliArguments.push(...appArguments);
		if (!options.wait) {
			childProcessOptions.stdio = "ignore";
			childProcessOptions.detached = true;
		}
	}
	if (platform === "darwin" && appArguments.length > 0) cliArguments.push("--args", ...appArguments);
	if (options.target) cliArguments.push(options.target);
	const subprocess = childProcess.spawn(command, cliArguments, childProcessOptions);
	if (options.wait) return new Promise((resolve, reject) => {
		subprocess.once("error", reject);
		subprocess.once("close", (exitCode) => {
			if (!options.allowNonzeroExitCode && exitCode !== 0) {
				reject(/* @__PURE__ */ new Error(`Exited with code ${exitCode}`));
				return;
			}
			resolve(subprocess);
		});
	});
	if (isFallbackAttempt) return new Promise((resolve, reject) => {
		subprocess.once("error", reject);
		subprocess.once("spawn", () => {
			subprocess.once("close", (exitCode) => {
				subprocess.off("error", reject);
				if (exitCode !== 0) {
					reject(/* @__PURE__ */ new Error(`Exited with code ${exitCode}`));
					return;
				}
				subprocess.unref();
				resolve(subprocess);
			});
		});
	});
	subprocess.unref();
	return new Promise((resolve, reject) => {
		subprocess.once("error", reject);
		subprocess.once("spawn", () => {
			subprocess.off("error", reject);
			resolve(subprocess);
		});
	});
};
const open = (target, options) => {
	if (typeof target !== "string") throw new TypeError("Expected a `target`");
	return baseOpen({
		...options,
		target
	});
};
function detectArchBinary(binary) {
	if (typeof binary === "string" || Array.isArray(binary)) return binary;
	const { [arch]: archBinary } = binary;
	if (!archBinary) throw new Error(`${arch} is not supported`);
	return archBinary;
}
function detectPlatformBinary({ [platform]: platformBinary }, { wsl } = {}) {
	if (wsl && is_wsl_default) return detectArchBinary(wsl);
	if (!platformBinary) throw new Error(`${platform} is not supported`);
	return detectArchBinary(platformBinary);
}
const apps = {
	browser: "browser",
	browserPrivate: "browserPrivate"
};
defineLazyProperty(apps, "chrome", () => detectPlatformBinary({
	darwin: "google chrome",
	win32: "chrome",
	linux: [
		"google-chrome",
		"google-chrome-stable",
		"chromium",
		"chromium-browser"
	]
}, { wsl: {
	ia32: "/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe",
	x64: ["/mnt/c/Program Files/Google/Chrome/Application/chrome.exe", "/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe"]
} }));
defineLazyProperty(apps, "brave", () => detectPlatformBinary({
	darwin: "brave browser",
	win32: "brave",
	linux: ["brave-browser", "brave"]
}, { wsl: {
	ia32: "/mnt/c/Program Files (x86)/BraveSoftware/Brave-Browser/Application/brave.exe",
	x64: ["/mnt/c/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe", "/mnt/c/Program Files (x86)/BraveSoftware/Brave-Browser/Application/brave.exe"]
} }));
defineLazyProperty(apps, "firefox", () => detectPlatformBinary({
	darwin: "firefox",
	win32: String.raw`C:\Program Files\Mozilla Firefox\firefox.exe`,
	linux: "firefox"
}, { wsl: "/mnt/c/Program Files/Mozilla Firefox/firefox.exe" }));
defineLazyProperty(apps, "edge", () => detectPlatformBinary({
	darwin: "microsoft edge",
	win32: "msedge",
	linux: ["microsoft-edge", "microsoft-edge-dev"]
}, { wsl: "/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" }));
defineLazyProperty(apps, "safari", () => detectPlatformBinary({ darwin: "Safari" }));
//#endregion
//#region src/npm-auth.ts
const REGISTRY_REQUEST_TIMEOUT_MS = 6e4;
let npmUserAgentPromise = null;
function isNpmAuthenticationFailure(result) {
	return /\b(?:E401|ENEEDAUTH|401|unauthorized|not logged in|need auth)\b/i.test(`${result.stdout}\n${result.stderr}`);
}
function validWebUrl(value) {
	if (typeof value !== "string") return false;
	try {
		return /^https?:$/.test(new URL(value).protocol);
	} catch {
		return false;
	}
}
async function openNpmAuthentication(url, operation) {
	if (!validWebUrl(url)) throw new UserError(`npm returned an invalid ${operation} URL`);
	const browser = process$1.env.REVIEW_NPM_STAGE_BROWSER;
	await open(url, browser ? { app: { name: browser } } : void 0);
	process$1.stderr.write(`Opened ${operation} in your browser; waiting for completion.\n`);
}
async function runNpmWebLogin(registry) {
	const args = [
		"login",
		"--auth-type=web",
		"--browser=false",
		registryArg(registry)
	];
	const child = spawn("npm", args, {
		cwd: process$1.cwd(),
		env: process$1.env,
		shell: false,
		stdio: [
			"ignore",
			"pipe",
			"pipe"
		]
	});
	const stdout = [];
	const stderr = [];
	let outputSize = 0;
	let outputExceeded = false;
	let browserOpen = null;
	let browserError = null;
	let loginOutput = "";
	const capture = (target, chunk) => {
		target.push(chunk);
		outputSize += chunk.length;
		if (outputSize > 268435456 && !outputExceeded) {
			outputExceeded = true;
			child.kill("SIGTERM");
		}
	};
	child.stdout.on("data", (chunk) => {
		capture(stdout, chunk);
		if (browserOpen) return;
		loginOutput = `${loginOutput}${chunk.toString("utf8")}`.slice(-16384);
		const match = loginOutput.match(/https?:\/\/\S+/);
		if (!match) return;
		browserOpen = openNpmAuthentication(match[0], "npm login").catch((error) => {
			browserError = error;
			child.kill("SIGTERM");
		});
	});
	child.stderr.on("data", (chunk) => capture(stderr, chunk));
	const exitCode = await new Promise((resolvePromise, rejectPromise) => {
		child.once("error", rejectPromise);
		child.once("close", (code) => resolvePromise(code ?? 1));
	});
	await browserOpen;
	if (browserError) throw browserError;
	if (outputExceeded) throw new UserError("npm login output exceeded the allowed size");
	const result = {
		exitCode,
		stdout: Buffer$1.concat(stdout).toString("utf8"),
		stderr: Buffer$1.concat(stderr).toString("utf8")
	};
	if (exitCode !== 0) throw new CommandError("npm", args, result);
	if (!browserOpen) throw new UserError("npm login did not provide a browser URL");
}
async function ensureNpmLogin(registry) {
	const whoamiArgs = ["whoami", registryArg(registry)];
	const current = await execCommand("npm", whoamiArgs, { allowFailure: true });
	const currentUsername = current.stdout.trim();
	if (current.exitCode === 0 && currentUsername) return currentUsername;
	if (current.exitCode !== 0 && !isNpmAuthenticationFailure(current)) throw new CommandError("npm", whoamiArgs, current);
	process$1.stderr.write(`npm is not logged in to ${registry}; opening npm login in your browser.\n`);
	await runNpmWebLogin(registry);
	const verified = await execCommand("npm", whoamiArgs, { allowFailure: true });
	const username = verified.stdout.trim();
	if (verified.exitCode !== 0) throw new CommandError("npm", whoamiArgs, verified);
	if (!username) throw new UserError(`npm login did not establish an authenticated session for ${registry}`);
	return username;
}
function interpolateEnvironment(value) {
	return value.replaceAll(/\$\{([^}]+)\}/g, (match, name) => {
		const replacement = process$1.env[name];
		return replacement === void 0 ? match : replacement;
	});
}
function parseNpmrc(contents) {
	const result = /* @__PURE__ */ new Map();
	for (const rawLine of contents.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#") || line.startsWith(";")) continue;
		const separator = line.indexOf("=");
		if (separator < 1) continue;
		const key = line.slice(0, separator).trim();
		let value = line.slice(separator + 1).trim();
		if (value.length >= 2 && (value.startsWith("\"") && value.endsWith("\"") || value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
		result.set(key, interpolateEnvironment(value));
	}
	return result;
}
async function findProjectNpmrc() {
	let directory = process$1.cwd();
	const root = parse(directory).root;
	while (true) {
		const candidate = join(directory, ".npmrc");
		if (await pathExists(candidate)) return candidate;
		if (directory === root) return null;
		directory = dirname(directory);
	}
}
async function loadNpmConfig() {
	const userConfig = resolve(process$1.env.NPM_CONFIG_USERCONFIG || process$1.env.npm_config_userconfig || join(homedir(), ".npmrc"));
	const projectConfig = await findProjectNpmrc();
	const paths = [...new Set([userConfig, projectConfig].filter(Boolean))];
	const config = /* @__PURE__ */ new Map();
	for (const path of paths) try {
		const parsed = parseNpmrc(await readFile(path, "utf8"));
		for (const [key, value] of parsed) config.set(key, value);
	} catch (error) {
		if ((error && typeof error === "object" && "code" in error ? error.code : null) !== "ENOENT") throw error;
	}
	return config;
}
function registryAuthKey(registry, config) {
	const parsed = new URL(registry);
	let prefix = `//${parsed.host}${parsed.pathname}`;
	while (prefix.length > 2) {
		if (config.has(`${prefix}:_authToken`) || config.has(`${prefix}:_auth`) || config.has(`${prefix}:username`) && config.has(`${prefix}:_password`)) return prefix;
		prefix = prefix.replace(/([^/]+|\/)$/, "");
	}
	return null;
}
async function npmAuthorization(registry) {
	const config = await loadNpmConfig();
	const key = registryAuthKey(registry, config);
	if (!key) return null;
	const token = config.get(`${key}:_authToken`);
	if (token) return `Bearer ${token}`;
	const auth = config.get(`${key}:_auth`);
	if (auth) return `Basic ${auth}`;
	const username = config.get(`${key}:username`);
	const encodedPassword = config.get(`${key}:_password`);
	if (!username || !encodedPassword) return null;
	const password = Buffer$1.from(encodedPassword, "base64").toString("utf8");
	return `Basic ${Buffer$1.from(`${username}:${password}`).toString("base64")}`;
}
function npmUserAgent() {
	npmUserAgentPromise ||= execCommand("npm", ["--version"]).then((result) => {
		return `npm/${result.stdout.trim()} node/${process$1.version} ${process$1.platform} ${process$1.arch} workspaces/false`;
	});
	return npmUserAgentPromise;
}
async function registryRequest(url, { authorization, method = "GET", otp, sendAuthorization = true }) {
	const headers = new Headers({
		accept: "application/json",
		"npm-auth-type": "web",
		"npm-command": "stage",
		"user-agent": await npmUserAgent()
	});
	if (authorization && sendAuthorization) headers.set("authorization", authorization);
	if (otp) headers.set("npm-otp", otp);
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), REGISTRY_REQUEST_TIMEOUT_MS);
	let response;
	try {
		response = await fetch(url, {
			headers,
			method,
			signal: controller.signal
		});
	} catch (error) {
		throw new UserError(`npm registry request failed for ${url}: ${sanitizeOutput(error instanceof Error ? error.message : String(error))}`);
	} finally {
		clearTimeout(timeout);
	}
	let body;
	try {
		body = await response.json();
	} catch {
		body = {};
	}
	return {
		body: body && typeof body === "object" && !Array.isArray(body) ? body : {},
		response
	};
}
function webAuthenticationUrls(result) {
	if (!isOtpRequired(result)) return null;
	if (!validWebUrl(result.body.authUrl) || !validWebUrl(result.body.doneUrl)) return null;
	return {
		authUrl: result.body.authUrl,
		doneUrl: result.body.doneUrl
	};
}
function isOtpRequired(result) {
	const challenge = result.response.headers.get("www-authenticate") || "";
	const message = [result.body.error, result.body.message].filter((value) => typeof value === "string").join(" ");
	return result.response.status === 401 && (challenge.split(/,\s*/).some((value) => value.toLowerCase() === "otp") || /one-time pass/i.test(message));
}
function approvalFailure(stageId, result) {
	const detail = typeof result.body.error === "string" ? `: ${sanitizeOutput(result.body.error)}` : "";
	return new UserError(`npm registry approval failed (${result.response.status}) for stage ${stageId}${detail}`);
}
async function waitForWebAuthentication(doneUrl, registry, authorization) {
	while (true) {
		const url = new URL(doneUrl);
		const result = await registryRequest(url, {
			authorization,
			sendAuthorization: url.origin === new URL(registry).origin
		});
		if (result.response.status === 200) {
			if (typeof result.body.token !== "string" || !result.body.token) throw new UserError("npm web authentication completed without a one-time token");
			return result.body.token;
		}
		if (result.response.status !== 202) throw new UserError(`npm web authentication returned unexpected status ${result.response.status}`);
		const retryAfter = Number(result.response.headers.get("retry-after")) * 1e3;
		await setTimeout$1(retryAfter > 0 ? retryAfter : 1e3);
	}
}
async function approveNpmStage(stageId, registry) {
	if (!UUID_RE.test(stageId)) throw new UserError(`Invalid npm stage ID: ${stageId}`);
	const authorization = await npmAuthorization(registry);
	const endpoint = new URL(`-/stage/${stageId}/approve`, registry);
	const initial = await registryRequest(endpoint, {
		authorization,
		method: "POST"
	});
	if (initial.response.ok) return;
	const urls = webAuthenticationUrls(initial);
	if (!urls) throw approvalFailure(stageId, initial);
	await openNpmAuthentication(urls.authUrl, "npm stage approve authentication");
	const retry = await registryRequest(endpoint, {
		authorization,
		method: "POST",
		otp: await waitForWebAuthentication(urls.doneUrl, registry, authorization)
	});
	if (!retry.response.ok) throw approvalFailure(stageId, retry);
}
//#endregion
//#region node_modules/.pnpm/empathic@2.0.1/node_modules/empathic/resolve.mjs
/**
* Resolve an absolute path from {@link root}, but only
* if {@link input} isn't already absolute.
*
* @param input The path to resolve.
* @param root The base path; default = process.cwd()
* @returns The resolved absolute path.
*/
function absolute(input, root) {
	return isAbsolute(input) ? input : resolve(root || ".", input);
}
//#endregion
//#region node_modules/.pnpm/empathic@2.0.1/node_modules/empathic/walk.mjs
/**
* Get all parent directories of {@link base}.
* Stops after {@link Options['last']} is processed.
*
* @returns An array of absolute paths of all parent directories.
*/
function up(base, options) {
	let { last, cwd } = options || {};
	let tmp = absolute(base, cwd);
	let root = absolute(last || "/", cwd);
	let prev, arr = [];
	while (prev !== root) {
		arr.push(tmp);
		tmp = dirname(prev = tmp);
		if (tmp === prev) break;
	}
	return arr;
}
//#endregion
//#region node_modules/.pnpm/empathic@2.0.1/node_modules/empathic/find.mjs
/**
* Find a file by name, walking parent directories until found.
*
* > [NOTE]
* > This function only returns a value for file matches.
* > A directory match with the same name will be ignored.
*
* @param name The file name to find.
* @returns The absolute path to the file, if found.
*/
function file(name, options) {
	let dir, tmp;
	for (dir of up(options && options.cwd || "", options)) try {
		tmp = join(dir, name);
		if (statSync(tmp).isFile()) return tmp;
	} catch {}
}
//#endregion
//#region src/stages.ts
function isVersionPolicyFailure(result) {
	const text = `${result.stdout}\n${result.stderr}`;
	return /pmOnFail|packageManager.*devEngines|configured to use .*pnpm/i.test(text);
}
async function discoverPnpmWorkspace(root, filters) {
	const workspaceRoot = resolve(root);
	if (!await pathExists(join(workspaceRoot, "pnpm-workspace.yaml"))) throw new UserError(`pnpm-workspace.yaml not found at ${workspaceRoot}`);
	const baseArgs = [
		"list",
		"-r",
		"--depth",
		"-1",
		"--json",
		"--dir",
		workspaceRoot
	];
	for (const filter of filters) baseArgs.push("--filter", filter);
	let result = await execCommand("pnpm", baseArgs, { allowFailure: true });
	const warnings = [];
	if (result.exitCode !== 0 && isVersionPolicyFailure(result)) {
		warnings.push("pnpm project package-manager version policy was bypassed for the read-only workspace listing");
		result = await execCommand("pnpm", ["--pm-on-fail=ignore", ...baseArgs], { allowFailure: true });
	}
	if (result.exitCode !== 0) throw new CommandError("pnpm", baseArgs, result);
	const projects = parseJson(result.stdout, "pnpm list");
	if (!Array.isArray(projects)) throw new UserError("pnpm list did not return an array");
	const all = [];
	for (const project of projects) {
		if (!project || typeof project !== "object" || !project.path) continue;
		let manifest;
		try {
			manifest = await readPackageManifest(join(project.path, "package.json"));
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			warnings.push(`Skipped ${project.path}: ${message}`);
			continue;
		}
		const name = project.name || manifest.name;
		const version = project.version || manifest.version;
		all.push({
			name: typeof name === "string" ? name : null,
			version: typeof version === "string" ? version : null,
			path: resolve(project.path),
			private: project.private === true || manifest.private === true
		});
	}
	const candidates = all.filter((project) => project.name && parseSemver(project.version) && !project.private);
	if (candidates.length === 0) throw new UserError("No publishable pnpm workspace packages with valid name and version were found");
	return {
		root: workspaceRoot,
		all,
		candidates,
		warnings
	};
}
function validateStageItem(item) {
	if (!item || typeof item !== "object") throw new UserError("Invalid npm stage item");
	if (!UUID_RE.test(item.id || "")) throw new UserError(`Invalid stage ID returned by npm: ${item.id}`);
	if (typeof item.packageName !== "string" || !item.packageName) throw new UserError(`Stage ${item.id} has no package name`);
	if (!parseSemver(item.version)) throw new UserError(`Stage ${item.id} has invalid SemVer ${item.version}`);
	return {
		id: item.id,
		packageName: item.packageName,
		version: item.version,
		tag: item.tag ?? null,
		createdAt: item.createdAt ?? null,
		actor: item.actor ?? null,
		actorType: item.actorType ?? null,
		shasum: item.shasum ?? null
	};
}
async function npmStageList(registry, packageName = null) {
	const args = ["stage", "list"];
	if (packageName) args.push(packageName);
	args.push("--json", registryArg(registry));
	const items = parseJson((await execCommand("npm", args)).stdout, "npm stage list");
	if (!Array.isArray(items)) throw new UserError("npm stage list did not return an array");
	return items.map(validateStageItem);
}
function stageIdentity(item) {
	return `${item.packageName}@${item.version}`;
}
async function pollForStages(mode, registry, { timeout, interval }) {
	const deadline = Date.now() + timeout * 1e3;
	while (true) {
		if (mode.kind === "package") {
			const unique = uniqueStages((await npmStageList(registry, mode.target.name)).filter((item) => item.packageName === mode.target.name && item.version === mode.target.version));
			if (unique.length > 0) return unique;
		} else {
			const candidates = new Set(mode.workspace.candidates.map((project) => `${project.name}@${project.version}`));
			const unique = uniqueStages((await npmStageList(registry)).filter((item) => candidates.has(stageIdentity(item))));
			if (unique.length > 0) return unique;
		}
		if (Date.now() >= deadline) break;
		await setTimeout$1(Math.min(interval * 1e3, Math.max(0, deadline - Date.now())));
	}
	throw new UserError(`Timed out after ${timeout} seconds waiting for the expected npm stage records`);
}
function uniqueStages(items) {
	const byId = /* @__PURE__ */ new Map();
	const byIdentity = /* @__PURE__ */ new Map();
	for (const item of items) {
		if (byId.has(item.id)) continue;
		const identity = stageIdentity(item);
		if (byIdentity.has(identity)) throw new UserError(`Multiple stage IDs matched ${identity}`);
		byId.set(item.id, item);
		byIdentity.set(identity, item.id);
	}
	return [...byId.values()].toSorted((a, b) => stageIdentity(a).localeCompare(stageIdentity(b), "en"));
}
async function determineCollectMode(options) {
	if (options.workspaceRoot) return {
		kind: "workspace",
		workspace: await discoverPnpmWorkspace(options.workspaceRoot, options.pnpmFilters)
	};
	const workspaceFile = file("pnpm-workspace.yaml");
	if (workspaceFile) return {
		kind: "workspace",
		workspace: await discoverPnpmWorkspace(dirname(workspaceFile), [])
	};
	const packagePath = join(process$1.cwd(), "package.json");
	if (!await pathExists(packagePath)) throw new UserError("No pnpm-workspace.yaml or package.json found in the current project");
	const manifest = await readPackageManifest(packagePath);
	if (manifest.private === true) throw new UserError("The current package is private");
	if (!manifest.name || !parseSemver(manifest.version)) throw new UserError("The current package.json needs a name and exact SemVer version");
	return {
		kind: "package",
		target: {
			name: manifest.name,
			version: manifest.version
		}
	};
}
//#endregion
//#region src/verdict.ts
const FINDING_CATEGORIES = /* @__PURE__ */ new Set([
	"malware",
	"supply-chain",
	"breaking-change",
	"api-change",
	"coverage",
	"integrity"
]);
function assertStringArray(value, label) {
	if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item)) throw new UserError(`${label} must be an array of non-empty strings`);
}
function assertExactKeys(value, allowed, label) {
	const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
	if (unexpected.length > 0) throw new UserError(`${label} contains unexpected fields: ${unexpected.join(", ")}`);
}
function validateVerdict(verdict, review) {
	if (!verdict || typeof verdict !== "object" || Array.isArray(verdict)) throw new UserError("Verdict must be a JSON object");
	assertExactKeys(verdict, [
		"batchDecision",
		"summary",
		"packages"
	], "Verdict");
	if (![
		"high-confidence",
		"needs-confirmation",
		"block"
	].includes(verdict.batchDecision)) throw new UserError("Verdict batchDecision is invalid");
	if (typeof verdict.summary !== "string" || !verdict.summary.trim()) throw new UserError("Verdict summary must be a non-empty string");
	if (!Array.isArray(verdict.packages)) throw new UserError("Verdict packages must be an array");
	const expectedById = new Map(review.packages.map((pkg) => [pkg.stage.id, pkg]));
	if (verdict.packages.length !== expectedById.size) throw new UserError("Verdict must contain every reviewed package exactly once");
	const seen = /* @__PURE__ */ new Set();
	for (const item of verdict.packages) {
		if (!item || typeof item !== "object" || Array.isArray(item)) throw new UserError("Invalid package verdict");
		assertExactKeys(item, [
			"stageId",
			"packageName",
			"version",
			"patchSha256",
			"coverage",
			"findings",
			"breakingVersionCompliant",
			"apiSummary"
		], "Package verdict");
		const expected = expectedById.get(item.stageId);
		if (!expected || seen.has(item.stageId)) throw new UserError(`Unexpected or duplicate verdict stage ID: ${item.stageId}`);
		seen.add(item.stageId);
		if (item.packageName !== expected.stage.packageName || item.version !== expected.stage.version) throw new UserError(`Verdict identity mismatch for stage ${item.stageId}`);
		if (item.patchSha256 !== expected.patch.sha256) throw new UserError(`Verdict patch hash mismatch for ${item.packageName}`);
		if (!["complete", "incomplete"].includes(item.coverage)) throw new UserError(`Invalid coverage for ${item.packageName}`);
		if (typeof item.breakingVersionCompliant !== "boolean") throw new UserError(`breakingVersionCompliant must be boolean for ${item.packageName}`);
		if (!Array.isArray(item.findings)) throw new UserError(`findings must be an array for ${item.packageName}`);
		for (const finding of item.findings) {
			if (!finding || typeof finding !== "object" || Array.isArray(finding)) throw new UserError(`Invalid finding for ${item.packageName}`);
			assertExactKeys(finding, [
				"severity",
				"category",
				"title",
				"evidence",
				"disposition"
			], `${item.packageName} finding`);
			if (![
				"info",
				"low",
				"medium",
				"high",
				"critical"
			].includes(finding.severity) || !FINDING_CATEGORIES.has(finding.category) || typeof finding.title !== "string" || !finding.title || typeof finding.evidence !== "string" || !finding.evidence || typeof finding.disposition !== "string" || !finding.disposition) throw new UserError(`Invalid finding for ${item.packageName}`);
		}
		if (!item.apiSummary || typeof item.apiSummary !== "object" || Array.isArray(item.apiSummary)) throw new UserError(`apiSummary is required for ${item.packageName}`);
		assertExactKeys(item.apiSummary, [
			"added",
			"removed",
			"changed"
		], `${item.packageName}.apiSummary`);
		for (const field of [
			"added",
			"removed",
			"changed"
		]) assertStringArray(item.apiSummary[field], `${item.packageName}.apiSummary.${field}`);
	}
	if (verdict.batchDecision === "high-confidence" && verdict.packages.some((item) => item.coverage !== "complete" || item.breakingVersionCompliant !== true || item.findings.some((finding) => ["high", "critical"].includes(finding.severity)))) throw new UserError("high-confidence verdict cannot contain incomplete coverage, noncompliant breaking changes, or high/critical findings");
	return verdict;
}
//#endregion
//#region src/approval.ts
function sameStringSet(left, right) {
	if (!Array.isArray(left) || left.some((value) => typeof value !== "string")) return false;
	return left.length === right.length && left.toSorted().every((value, index) => value === right.toSorted()[index]);
}
function isNonEmptyString(value) {
	return typeof value === "string" && value.length > 0;
}
function isStringArray(value) {
	return Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0);
}
function hasConsistentAutomaticApprovalResult(value) {
	if (typeof value.automaticApprovalChecksPassed !== "boolean" || !isStringArray(value.automaticApprovalBlockers)) return false;
	return value.automaticApprovalChecksPassed ? value.automaticApprovalBlockers.length === 0 : value.automaticApprovalBlockers.length > 0;
}
async function assertReviewArtifact(root, inputPath) {
	if (typeof inputPath !== "string" || !inputPath) throw new UserError("Review artifact path is missing");
	const requested = resolve(inputPath);
	const relativePath = relative(root, requested);
	if (!relativePath || relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) throw new UserError(`Review artifact escapes the review directory: ${inputPath}`);
	const info = await lstat(requested);
	if (info.isSymbolicLink() || !info.isFile()) throw new UserError(`Review artifact must be a regular non-symlink file: ${inputPath}`);
	const actual = await realpath(requested);
	const actualRelative = relative(root, actual);
	if (actualRelative === ".." || actualRelative.startsWith(`..${sep}`) || isAbsolute(actualRelative)) throw new UserError(`Review artifact resolves outside the review directory: ${inputPath}`);
	return actual;
}
async function validateReviewSnapshot(actual, sentinel, review) {
	if (review.reviewId !== sentinel.reviewId || review.reviewDir !== actual || review.registry !== sentinel.registry || !hasConsistentAutomaticApprovalResult(review) || !isStringArray(review.approvalOrder) || !Array.isArray(review.packages) || review.packages.length === 0) throw new UserError("review.json does not match the review sentinel");
	const stageIds = [];
	const packageNames = /* @__PURE__ */ new Set();
	for (const pkg of review.packages) {
		if (!pkg?.stage?.id || typeof pkg.stage.packageName !== "string" || typeof pkg.stage.version !== "string" || typeof pkg.patch?.sha256 !== "string" || !hasConsistentAutomaticApprovalResult(pkg)) throw new UserError("review.json contains an invalid package record");
		if (stageIds.includes(pkg.stage.id) || packageNames.has(pkg.stage.packageName)) throw new UserError("review.json contains duplicate stage IDs or package names");
		stageIds.push(pkg.stage.id);
		packageNames.add(pkg.stage.packageName);
		if ((await computeFileHashes(await assertReviewArtifact(actual, pkg.artifacts?.patch))).sha256 !== pkg.patch.sha256) throw new UserError(`Stored patch hash mismatch for ${pkg.stage.packageName}`);
	}
	if (!sameStringSet(sentinel.packageStageIds, stageIds)) throw new UserError("review.json package set does not match the review sentinel");
}
async function assertReviewDirectory(inputPath) {
	const requested = resolve(inputPath);
	const info = await lstat(requested);
	if (info.isSymbolicLink() || !info.isDirectory()) throw new UserError("Review directory must be a real directory, not a symlink");
	const actual = await realpath(requested);
	if (!basename(actual).startsWith("review-npm-stage-")) throw new UserError(`Refusing unsafe review directory: ${actual}`);
	const sentinelPath = await assertReviewArtifact(actual, join(actual, SENTINEL_NAME));
	const sentinel = parseJson(await readFile(sentinelPath, "utf8"), sentinelPath);
	if (sentinel.kind !== "review-npm-stage" || sentinel.reviewDir !== actual || !isNonEmptyString(sentinel.reviewId) || !isNonEmptyString(sentinel.registry) || !isNonEmptyString(sentinel.status) || !isNonEmptyString(sentinel.createdAt)) throw new UserError(`Invalid review sentinel in ${actual}`);
	return {
		actual,
		sentinel,
		sentinelPath
	};
}
async function approve(options) {
	if (!options.reviewDir || !options.verdict) throw new UserError("approve requires --review-dir and --verdict");
	const { actual, sentinel, sentinelPath } = await assertReviewDirectory(options.reviewDir);
	if (sentinel.status !== "ready" && sentinel.status !== "approval-failed") throw new UserError(`Review is not ready for approval; current status is ${sentinel.status}`);
	const reviewPath = await assertReviewArtifact(actual, sentinel.reviewFile || join(actual, "review.json"));
	const reviewHashes = await computeFileHashes(reviewPath);
	if (typeof sentinel.reviewSha256 !== "string" || reviewHashes.sha256 !== sentinel.reviewSha256) throw new UserError("Stored review.json hash does not match the review sentinel");
	const review = parseJson(await readFile(reviewPath, "utf8"), reviewPath);
	await validateReviewSnapshot(actual, sentinel, review);
	const verdictPath = isAbsolute(options.verdict) ? resolve(options.verdict) : resolve(process$1.cwd(), options.verdict);
	const verdict = validateVerdict(parseJson(await readFile(verdictPath, "utf8"), verdictPath), review);
	const automaticEligible = verdict.batchDecision === "high-confidence" && review.automaticApprovalChecksPassed === true && verdict.packages.every((pkg) => pkg.coverage === "complete" && pkg.breakingVersionCompliant === true && pkg.findings.every((finding) => !["high", "critical"].includes(finding.severity)));
	if (!automaticEligible && !options.manualConfirmed) throw new UserError("Automatic approval checks did not pass. Obtain explicit user confirmation, then rerun with --manual-confirmed.");
	const packageByName = new Map(review.packages.map((pkg) => [pkg.stage.packageName, pkg]));
	const ordered = (review.dependencyGraph?.cycle ? [...packageByName.keys()].toSorted((a, b) => a.localeCompare(b, "en")) : review.approvalOrder).map((name) => {
		const pkg = packageByName.get(name);
		if (!pkg) throw new UserError(`Approval order references unknown package ${name}`);
		return pkg;
	});
	await ensureNpmLogin(review.registry);
	const approvalResult = {
		reviewId: review.reviewId,
		startedAt: (/* @__PURE__ */ new Date()).toISOString(),
		automaticEligible,
		manualConfirmed: options.manualConfirmed,
		approved: [],
		remaining: ordered.map((pkg) => pkg.stage),
		status: "in-progress"
	};
	const resultPath = join(actual, "approval-result.json");
	await writeJson(resultPath, approvalResult);
	await writeJson(sentinelPath, {
		...sentinel,
		status: "approving"
	});
	for (const pkg of ordered) {
		let approved;
		try {
			await approveNpmStage(pkg.stage.id, review.registry);
			approved = true;
		} catch {
			approved = await packageVersionPublished(pkg.stage.packageName, pkg.stage.version, review.registry);
		}
		if (!approved) {
			approvalResult.status = "failed";
			approvalResult.error = `Approval failed for ${stageIdentity(pkg.stage)}`;
			approvalResult.remaining = ordered.filter((item) => approvalResult.approved.every((done) => done.id !== item.stage.id)).map((item) => item.stage);
			await writeJson(resultPath, approvalResult);
			await writeJson(sentinelPath, {
				...sentinel,
				status: "approval-failed"
			});
			throw new UserError(`${approvalResult.error}. Stop the batch; do not approve later packages automatically.`);
		}
		approvalResult.approved.push(pkg.stage);
		approvalResult.remaining = ordered.filter((item) => approvalResult.approved.every((done) => done.id !== item.stage.id)).map((item) => item.stage);
		await writeJson(resultPath, approvalResult);
	}
	approvalResult.status = "approved";
	approvalResult.completedAt = (/* @__PURE__ */ new Date()).toISOString();
	await writeJson(resultPath, approvalResult);
	await writeJson(sentinelPath, {
		...sentinel,
		status: "approved",
		approvalResult: resultPath
	});
	process$1.stdout.write(`${JSON.stringify({
		status: "approved",
		reviewDir: actual,
		packageCount: approvalResult.approved.length,
		approvalResult: resultPath
	})}\n`);
	return approvalResult;
}
async function cleanup(options) {
	if (!options.reviewDir) throw new UserError("cleanup requires --review-dir");
	const { actual } = await assertReviewDirectory(options.reviewDir);
	await rm(actual, {
		recursive: true,
		force: false,
		maxRetries: 2
	});
	process$1.stdout.write(`${JSON.stringify({
		status: "removed",
		reviewDir: actual
	})}\n`);
}
//#endregion
//#region src/collect.ts
function serializablePackage(pkg) {
	return {
		key: pkg.key,
		stage: pkg.stage,
		baseline: pkg.baseline,
		staged: pkg.staged,
		artifacts: pkg.artifacts,
		patch: pkg.patch,
		fileChanges: pkg.fileChanges,
		dependencyDelta: pkg.dependencyDelta,
		dependencyReview: pkg.dependencyReview,
		automaticApprovalChecksPassed: pkg.automaticApprovalBlockers.length === 0,
		automaticApprovalBlockers: pkg.automaticApprovalBlockers
	};
}
async function collect(options) {
	const runtimes = await ensureRequirements({ workspaceMode: options.workspaceRoot !== null || Boolean(file("pnpm-workspace.yaml")) });
	const mode = await determineCollectMode(options);
	const registry = normalizeRegistry(options.registry || (await execCommand("npm", [
		"config",
		"get",
		"registry"
	])).stdout.trim());
	await ensureNpmLogin(registry);
	const stages = await pollForStages(mode, registry, options);
	const reviewDir = await createReviewDirectory(options.outputDir);
	const reviewId = createHash("sha256").update(`${Date.now()}\0${reviewDir}\0${stages.map((stage) => stage.id).join("\0")}`).digest("hex").slice(0, 24);
	const sentinelPath = join(reviewDir, SENTINEL_NAME);
	const baseSentinel = {
		kind: "review-npm-stage",
		reviewId,
		reviewDir,
		registry,
		status: "collecting",
		createdAt: (/* @__PURE__ */ new Date()).toISOString()
	};
	await writeJson(sentinelPath, baseSentinel);
	try {
		const packages = [];
		for (const stage of stages) packages.push(await collectPackage(stage, reviewDir, registry));
		const packageByName = new Map(packages.map((pkg) => [pkg.stage.packageName, pkg]));
		const workspaceProjects = mode.kind === "workspace" ? mode.workspace.all : [];
		const workspaceByName = new Map(workspaceProjects.filter((project) => project.name).map((project) => [project.name, project]));
		for (const pkg of packages) await analyzePackageDependencies(pkg, packageByName, workspaceByName, registry);
		const graph = buildApprovalOrder(packages);
		const automaticApprovalBlockers = [];
		if (graph.cycle) automaticApprovalBlockers.push("WORKSPACE_DEPENDENCY_CYCLE");
		for (const edge of graph.edges) if (edge.rangeSatisfied !== true) automaticApprovalBlockers.push(`${edge.to}:${edge.rangeSatisfied === false ? "INTERNAL_DEPENDENCY_RANGE_MISMATCH" : "INTERNAL_DEPENDENCY_RANGE_UNVERIFIED"}:${edge.from}`);
		for (const pkg of packages) for (const reason of pkg.automaticApprovalBlockers) automaticApprovalBlockers.push(`${pkg.stage.packageName}:${reason}`);
		const warnings = [...mode.kind === "workspace" ? mode.workspace.warnings : [], ...packages.filter((pkg) => pkg.patch.large).map((pkg) => `${pkg.stage.packageName} patch is ${pkg.patch.bytes} bytes; coverage must be explicitly complete`)];
		const review = {
			reviewId,
			createdAt: baseSentinel.createdAt,
			reviewDir,
			registry,
			runtimes,
			mode: mode.kind,
			warnings,
			automaticApprovalChecksPassed: automaticApprovalBlockers.length === 0,
			automaticApprovalBlockers: [...new Set(automaticApprovalBlockers)].toSorted(),
			dependencyGraph: graph,
			approvalOrder: graph.order,
			packages: packages.map(serializablePackage)
		};
		const reviewFile = join(reviewDir, REVIEW_FILE);
		await writeJson(reviewFile, review);
		const reviewHashes = await computeFileHashes(reviewFile);
		await writeJson(sentinelPath, {
			...baseSentinel,
			status: "ready",
			reviewFile,
			reviewSha256: reviewHashes.sha256,
			packageStageIds: stages.map((stage) => stage.id)
		});
		process$1.stdout.write(`${JSON.stringify({
			reviewDir,
			reviewFile,
			packageCount: packages.length,
			automaticApprovalChecksPassed: review.automaticApprovalChecksPassed,
			warnings
		})}\n`);
		return review;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		await writeJson(sentinelPath, {
			...baseSentinel,
			status: "collection-failed",
			error: sanitizeOutput(message)
		});
		process$1.stderr.write(`${JSON.stringify({
			status: "collection-failed",
			reviewDir,
			sentinelPath
		})}\n`);
		throw error;
	}
}
//#endregion
//#region src/cli.ts
function stringList(value) {
	if (value === void 0) return [];
	return (Array.isArray(value) ? value : [value]).map(String);
}
function optionalString(value) {
	return typeof value === "string" && value ? value : null;
}
function positiveNumber(raw, name, { allowZero = false } = {}) {
	const value = Number(raw);
	if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) throw new UserError(`${name} must be ${allowZero ? "a non-negative" : "a positive"} number`);
	return value;
}
function collectOptionsFromCli(options) {
	const result = {
		pnpmFilters: stringList(options.pnpmFilter),
		timeout: positiveNumber(options.timeout ?? 600, "--timeout"),
		interval: positiveNumber(options.interval ?? 1, "--interval"),
		workspaceRoot: optionalString(options.pnpmWorkspace),
		registry: optionalString(options.registry),
		outputDir: optionalString(options.outputDir)
	};
	if (result.pnpmFilters.length > 0 && result.workspaceRoot === null) throw new UserError("--pnpm-filter requires --pnpm-workspace");
	return result;
}
function approveOptionsFromCli(options) {
	const result = {
		reviewDir: optionalString(options.reviewDir),
		verdict: optionalString(options.verdict),
		manualConfirmed: options.manualConfirmed === true
	};
	if (!result.reviewDir || !result.verdict) throw new UserError("approve requires --review-dir and --verdict");
	return result;
}
function cleanupOptionsFromCli(options) {
	const result = { reviewDir: optionalString(options.reviewDir) };
	if (!result.reviewDir) throw new UserError("cleanup requires --review-dir");
	return result;
}
function createReviewCli() {
	const cli = cac("review-stage");
	cli.command("collect", "Collect and verify staged package review artifacts").option("--pnpm-workspace <path>", "Discover packages from a pnpm workspace").option("--pnpm-filter <selector>", "pnpm workspace filter; repeat as needed").option("--registry <url>", "npm registry URL").option("--timeout <seconds>", "Total stage wait timeout", { default: 600 }).option("--interval <seconds>", "Stage polling interval", { default: 1 }).option("--output-dir <path>", "Parent directory for private review artifacts").action(async (options) => {
		await collect(collectOptionsFromCli(options));
	});
	cli.command("approve", "Approve a completely reviewed staged package batch").option("--review-dir <path>", "Collector review directory").option("--verdict <file>", "Schema-valid verdict JSON file").option("--manual-confirmed", "Record explicit user confirmation when automatic approval is unavailable").action(async (options) => {
		await approve(approveOptionsFromCli(options));
	});
	cli.command("cleanup", "Remove a validated private review directory").option("--review-dir <path>", "Collector review directory").action(async (options) => {
		await cleanup(cleanupOptionsFromCli(options));
	});
	cli.usage("<command> [options]");
	cli.help();
	return cli;
}
async function runCli(argv) {
	const cli = createReviewCli();
	if (argv.length === 2) {
		cli.outputHelp();
		return;
	}
	const parsed = cli.parse(argv, { run: false });
	if (!cli.matchedCommand && parsed.args[0]) throw new UserError(`Unknown command: ${parsed.args[0]}`);
	await cli.runMatchedCommand();
}
//#endregion
//#region src/review-stage.ts
runCli(process$1.argv).catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	process$1.stderr.write(`${sanitizeOutput(message)}\n`);
	if (process$1.env.REVIEW_NPM_STAGE_DEBUG === "1" && error instanceof Error && error.stack) process$1.stderr.write(`${sanitizeOutput(error.stack)}\n`);
	process$1.exitCode = 1;
});
//#endregion
export {};
