import type { FastifyPluginCallback } from "fastify";
import { APIv1_RequestSchema, APIv1_Response } from "../apiV1";
import { getAPIKey } from "../lib/apiKeys";
import { lookupConfig } from "../lib/config";
import { compareVersions, padVersion } from "../lib/shared";

const api: FastifyPluginCallback = async (app, opts, done) => {
	if (process.env.API_REQUIRE_KEY !== "false") {
		await app.register(import("../plugins/checkAPIKey"));
	}

	await app.register(import("@fastify/rate-limit"), {
		global: true,
		keyGenerator:
			process.env.API_REQUIRE_KEY !== "false"
				? (req) => getAPIKey(req)?.id.toString() ?? "anonymous"
				: undefined,
		max: (req) => getAPIKey(req)?.rateLimit ?? 1000,
		timeWindow: "1 hour",
	});

	app.post(
		"/api/v1/updates",
		async (request, reply): Promise<Readonly<APIv1_Response>> => {
			const result = await APIv1_RequestSchema.safeParseAsync(
				request.body,
			);
			if (!result.success) {
				// Invalid request
				return reply.code(400).send(result.error.format());
			}
			const { manufacturerId, productType, productId, firmwareVersion } =
				result.data;

			const config = await lookupConfig(
				manufacturerId,
				productType,
				productId,
				firmwareVersion,
			);
			if (!config) {
				// Config not found
				return reply.send([]);
			}

			return config.upgrades.map((u) => {
				// Add missing fields to the returned objects
				const downgrade =
					compareVersions(u.version, firmwareVersion) < 0;
				let normalizedVersion = padVersion(u.version);
				if (u.channel === "beta") normalizedVersion += "-beta";

				return {
					...u,
					downgrade,
					normalizedVersion,
				};
			});
		},
	);

	done();
};

export default api;
