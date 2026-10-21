import { Container, Text, __dayjs } from '../libs/nofbiz/nofbiz.base.js'
import { getUserDisplayName, getLocationValue } from './user-helpers.js'
import { DIRECTION_LABELS } from './constants.js'

export function trackingIdColumn() {
  return {
    label: 'Tracking ID',
    render: (pkg) => new Text(pkg.Title, { type: 'span', class: 'posthub__table-cell' }),
  }
}

export function statusBadgeColumn() {
  return {
    label: 'Status',
    render: (pkg) => {
      if (!pkg.Status) {
        return new Text('--', { type: 'span', class: 'posthub__table-cell' })
      }
      const statusClass = pkg.Status.toLowerCase().replace(' ', '-')
      return new Container([
        new Text(pkg.Status, {
          type: 'span',
          class: `posthub__status-badge posthub__status-badge--${statusClass}`,
        }),
      ], { class: 'posthub__table-cell' })
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
      pkg[field] ? __dayjs(pkg[field]).format('DD/MM/YYYY') : '',
      { type: 'span', class: 'posthub__table-cell' }
    ),
  }
}
