'use strict';

/**
 * Wait Time Estimation Service.
 *
 * Currently uses a formula-based approach. The backend will use this service
 * if the AI prediction service is unavailable or not yet configured.
 *
 * Formula: EstimatedWait = waitingCount × avgServiceTimeMinutes
 * Later: replace/supplement with AI service call.
 *
 * Architecture note: All frontends call the same backend endpoint.
 * The frontend does not know or care whether the estimate comes from this
 * formula or from the AI service. Only this service switches between sources.
 */

const axios = require('axios');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL;

/**
 * Estimate wait time for a new token joining the queue.
 *
 * @param {object} params
 * @param {string} params.centerId
 * @param {string} params.serviceId
 * @param {object} params.queue   - Current Queue document
 * @param {object} params.service - Service document
 * @returns {Promise<number>} Estimated wait in minutes (minimum 1)
 */
async function estimateWait({ centerId, serviceId, queue, service }) {
  // Try AI service first if configured
  if (AI_SERVICE_URL) {
    try {
      const aiEstimate = await _callAIService({ centerId, serviceId, queue, service });
      if (aiEstimate !== null) return aiEstimate;
    } catch (err) {
      // AI service unavailable — fall through to formula
      console.warn('[WaitTime] AI service unavailable, using formula:', err.message);
    }
  }

  return _formulaEstimate({ queue, service });
}

/**
 * Formula-based estimate.
 * Uses the queue's running average service time if available,
 * otherwise falls back to the service's configured average.
 */
function _formulaEstimate({ queue, service }) {
  // Number of people currently waiting (including active)
  const peopleAhead = (queue.waitingCount || 0) + (queue.activeCount || 0);

  // Average service time in minutes
  let avgMinutes;
  if (queue.avgServiceTimeSeconds) {
    avgMinutes = Math.ceil(queue.avgServiceTimeSeconds / 60);
  } else if (service && service.avgServiceTimeMinutes) {
    avgMinutes = service.avgServiceTimeMinutes;
  } else {
    avgMinutes = 8; // Conservative default
  }

  const estimate = Math.max(1, Math.round(peopleAhead * avgMinutes));
  return estimate;
}

/**
 * Call the Python FastAPI AI prediction service.
 * Returns null if the service is not available or returns an invalid response.
 */
async function _callAIService({ centerId, serviceId, queue, service }) {
  const response = await axios.post(
    `${AI_SERVICE_URL}/predict`,
    {
      center_id: centerId.toString(),
      service_id: serviceId.toString(),
      current_waiting: queue.waitingCount || 0,
      current_active: queue.activeCount || 0,
      avg_service_seconds: queue.avgServiceTimeSeconds || (service.avgServiceTimeMinutes * 60),
      hour_of_day: new Date().getHours(),
      day_of_week: new Date().getDay(),
    },
    { timeout: 3000 } // Don't block the user for more than 3s
  );

  if (response.data && typeof response.data.predicted_wait_minutes === 'number') {
    return Math.max(1, Math.round(response.data.predicted_wait_minutes));
  }

  return null;
}

module.exports = { estimateWait };
