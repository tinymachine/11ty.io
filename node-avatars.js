const slugify = require("slugify");
const defer = require("lodash.defer");
const sortObject = require("sorted-object");
const fs = require("fs-extra");
const fastglob = require("fast-glob");
const AvatarLocalCache = require("avatar-local-cache");

const skipUrls = ["https://www.gravatar.com/avatar/36386473ee7de091db26bd82f8d18ca8?default=404"];

async function fetchAvatar(name, image, cacheName) {
	let slug = slugify(name).toLowerCase();
	let dir = `img/avatar-local-cache/${cacheName ? `${cacheName}/` : ""}`;
	await fs.ensureDir(dir);

	return new Promise((resolve, reject) => {
		defer(async function() {
			if(image) {
				let avatarCache = new AvatarLocalCache();
				avatarCache.width = 73;

				let outputSlugPath = `${dir}${slug}`;
				let results = await avatarCache.fetchUrl(image, outputSlugPath);
				resolve(results);
			} else {
				resolve([]);
			}
		});
	});
}

async function fetchAvatarsForDataSource(sourceName, entries, fetchCallbacks) {
	let map = {};
	let path = `./_data/avatarmap/${sourceName}.json`;
	let existing = require(path);

	await fs.ensureDir("_data/avatarmap/");

	for(let entry of entries) {
		// we await here inside the loop (anti-pattern) as a cheap way to throttle too many simultaneous requests ¯\_(ツ)_/¯
		let name = fetchCallbacks.name(entry);
		let sluggedName = slugify(name).toLowerCase();
		let url = fetchCallbacks.image(entry);

		if( skipUrls.indexOf(url) > -1 ) {
			if(existing[sluggedName]) {
				map[sluggedName] = existing[sluggedName];
				console.log( `Kept from existing ${sluggedName}` );
			} else {
				console.log( `Skipped ${sluggedName}, couldn’t find existing record:`, existing[sluggedName] );
			}
		} else {
			let files = await fetchAvatar(name, url, sourceName);

			if( Array.isArray(files) && files.length ) {
				map[files[0].name] = files;
				console.log( `Wrote for ${files[0].name}` );
			}
		}
	}

	await fs.writeFile(path, JSON.stringify(sortObject(map), null, 2));
	console.log( `Wrote ${path}.` );
}

(async function() {
	// Open Collective
	let supporters = require("./_data/supporters.json").filter(entry => entry.role.toLowerCase() === "backer");
	fetchAvatarsForDataSource("opencollective", supporters, {
		name: supporter => supporter.name,
		image: supporter => supporter.image
	});

	// Twitter
	let twitters = new Set();
	let testimonials = require("./_data/testimonials.json").map(entry => entry.twitter);
	for(let twitter of testimonials) {
		twitters.add(twitter.toLowerCase());
	}
	let starters = require("./_data/starters.json").map(entry => entry.author);
	for(let twitter of starters) {
		twitters.add(twitter.toLowerCase());
	}
	let extras = require("./_data/extraAvatars.json").map(entry => entry.twitter);
	for(let twitter of extras) {
		twitters.add(twitter.toLowerCase());
	}

	let sites = await fastglob("./_data/sites/*.json", {
		caseSensitiveMatch: false
	});
	for(let site of sites) {
		let siteData = require(site);
		if(siteData.twitter) {
			twitters.add(siteData.twitter.toLowerCase());
		}
	}

	fetchAvatarsForDataSource("twitter", twitters, {
		name: twitter => twitter,
		image: twitter => `https://twitter.com/${twitter}/profile_image?size=bigger`
	});
})();
