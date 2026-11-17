import { Container, Text } from '../libs/nofbiz/nofbiz.base.js'
import { getUserDisplayName, getLocationValue } from './user-helpers.js'
import { DIRECTION_LABELS, STATUS_LABELS, STATUS_DESCRIPTIONS, TRACKING_NUMBER_LABEL } from './constants.js'
import { formatDisplayDate } from './date-helpers.js'

export function trackingIdColumn() {
  return {
    label: TRACKING_NUMBER_LABEL,
    render: (pkg) => new Text(pkg.Title, { type: 'span', class: 'posthub__table-cell' }),
  }
}

/**
 * Colored status pill; hovering shows what the status means (STATUS_DESCRIPTIONS).
 * Shared by the package tables and the detail panel.
 *
 * @param {string} status  Stored status value (e.g. 'in transit').
 * @returns {Text}
 */
export function createStatusBadge(status) {
  const statusClass = status.toLowerCase().replace(' ', '-')
  return new Text(STATUS_LABELS[status] || status, {
    type: 'span',
    class: `posthub__status-badge posthub__status-badge--${statusClass}`,
    title: STATUS_DESCRIPTIONS[status] || '',
  })
}

export function statusBadgeColumn() {
  return {
    label: 'Status',
    render: (pkg) => {
      if (!pkg.Status) {
        return new Text('--', { type: 'span', class: 'posthub__table-cell' })
      }
      return new Container([createStatusBadge(pkg.Status)], { class: 'posthub__table-cell' })
    },
  }
}

export function directionColumn() {
  return {
    label: 'Direction',
    render: (pkg) => new Text(
      pkg.Direction ? (DIRECTION_LABELS[pkg.Direction] || pkg.Direction) : '--',
      { type: 'span', class: 'posthub__table-cell' },
    ),
  }
}

export function currentLocationColumn() {
  return {
    label: 'Current Location',
    render: (pkg) => new Text(getLocationValue(pkg.CurrentLocation), { type: 'span', class: 'posthub__table-cell' }),
  }
}

export function destinationColumn() {
  return {
    label: 'Destination',
    render: (pkg) => new Text(getLocationValue(pkg.DestinationLocation), { type: 'span', class: 'posthub__table-cell' }),
  }
}

export function senderColumn() {
  return {
    label: 'Sender',
    render: (pkg) => new Text(getUserDisplayName(pkg.Sender), { type: 'span', class: 'posthub__table-cell' }),
  }
}

export function recipientColumn() {
  return {
    label: 'Recipient',
    render: (pkg) => new Text(getUserDisplayName(pkg.Recipient), { type: 'span', class: 'posthub__table-cell' }),
  }
}

export function packageDetailsColumn() {
  return {
    label: 'Mail Details',
    render: (pkg) => {
      const value = pkg.PackageDetails || '--'
      return new Text(value, {
        type: 'span',
        class: 'posthub__table-cell posthub__table-cell--truncate',
        title: value,
      })
    },
  }
}

export function dateColumn(label, field) {
  return {
    label,
    render: (pkg) => new Text(
      formatDisplayDate(pkg[field]),
      { type: 'span', class: 'posthub__table-cell' }
    ),
  }
}
