'use strict';

const net = require('net');
const util = require('util');
const log = require('util').log;

const EventEmitter = require('events').EventEmitter;

const xml2js = require('xml2js');
const chalk = require('chalk');

const cbusUtils = require('./cbus-utils.js');
const CBusNetId = require('./cbus-netid.js');

module.exports = CGateDatabase;

function CGateDatabase(netId, log) {
	// the netId must be in the format //${project}//${network}
	console.assert((typeof netId.application == `undefined`) && (typeof netId.group == `undefined`));
	this.netId = netId;
	
	// map of maps containing groups (by application, by group address)
	this.applications = undefined;
	
	// map of physical devices
	this.units = undefined;
	
	this.log = log;
}

CGateDatabase.prototype.fetch = function(client, callback) {
	console.assert((client.project == this.netId.project) && (client.network == this.netId.network));
	
	client.getDB(this.netId, result => {
		const dbxml = result.snippet.content;
		this.log.info(`dbgetxml ${util.inspect(result.snippet)} (${dbxml.length} bytes)`);
		
		xml2js.parseString(dbxml, {
			normalizeTags: true
		}, (err, database) => {
			console.assert(!err, `dbgetxml parse failure`, err);
			const result = _parseXML(database);
			this.applications = result.applications;
			this.units = result.units;
			console.log(`parsed.`);
			
			if (callback) {
				callback();
			}
		});
	});
};

function _parseXML(database) {
	let groupCount = 0;
	
	// create map of maps containing groups (by application, by group address)
	const applications = new Map();
	database.network.application.forEach(srcApplication => {
		const application = {
			address: cbusUtils.integerise(srcApplication.address[0]),
			name: srcApplication.tagname[0],
			groups: new Map()
		};
		applications.set(application.address, application);
		
		// now descend into groups
		srcApplication.group.forEach(srcGroup => {
			const group = {
				address: cbusUtils.integerise(srcGroup.address[0]),
				name: srcGroup.tagname[0]
			};
			application.groups.set(group.address, group);
			groupCount++;
		});
	});
	
	// create map of physical devices
	const units = new Map;
	database.network.unit.forEach(srcUnit => {
		const unit = {
			tag: srcUnit.tagname[0],
			partName: srcUnit.unitname[0],
			address: cbusUtils.integerise(srcUnit.address[0]),
			firmwareVersion: srcUnit.firmwareversion[0],
			serialNumber: srcUnit.serialnumber[0],
			catalogNumber: srcUnit.catalognumber[0],
			unitType: srcUnit.unittype[0]
		};
		units.set(unit.address, unit);
	});
	
	return {
		applications: applications,
		units: units
	};
}

CGateDatabase.prototype.getNetLabel = function(netId) {
	if (typeof this.applications == `undefined`) {
		return undefined;
	}
	
	console.assert(this.netId.project === netId.project, `getGroupName can only search in default project`);
	console.assert(this.netId.network === netId.network, `getGroupName can only search in default network`);
	
	let name;
	if (typeof netId.application != `undefined`) {
		// we have an application identifier
		const application = this.applications.get(netId.application);
		if (application) {
			// we found the application
			if (typeof netId.group == `undefined`) {
				// we don't have a group; use the application name
				name = application.name;
			} else {
				// group is defined
				const group = application.groups.get(netId.group);
				if (group) {
					// we found the group
					name = group.name;
				}
			}
		}
	} else {
		name = `network`;
	}
	
	if (typeof name == `undefined`) {
		name = `not-found`;
	}
	
	return name;
};
