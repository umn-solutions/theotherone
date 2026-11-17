import { Container, Button } from '../libs/nofbiz/nofbiz.base.js'

/**
 * Segmented toggle: a row of mutually exclusive option buttons (SPARC has no
 * native Switch). Highlights the selected option, re-renders itself on change
 * and reports the new value. Styles: posthub__segmented / posthub__seg-btn in
 * css/shared.css.
 *
 * @param {{ label: string, value: unknown }[]} options
 * @param {{ value: unknown, onChange: (value: unknown) => void }} props
 *   value: initially selected option value.
 * @returns {Container}
 */
export function createSegmentedToggle(options, { value, onChange }) {
  let selected = value
  const toggle = new Container([], { class: 'posthub__segmented' })

  function render() {
    toggle.children = options.map((option) => new Button(option.label, {
      variant: 'secondary',
      class: `posthub__seg-btn${option.value === selected ? ' posthub__seg-btn--active' : ''}`,
      onClickHandler: () => {
        if (option.value === selected) return
        selected = option.value
        render()
        onChange(selected)
      },
    }))
  }

  render()
  return toggle
}
