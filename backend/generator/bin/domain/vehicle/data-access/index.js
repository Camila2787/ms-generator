"use strict";

const Rx = require('rxjs');

const VehicleDA = require("./VehicleDA");

module.exports = {
  /**
   * Data-Access start workflow
   */
  start$: Rx.concat(VehicleDA.start$()),
  /**
   * @returns {VehicleDA}
   */
  VehicleDA: VehicleDA,
};
