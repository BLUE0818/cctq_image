import { describe, expect, it } from 'vitest'
import { getMentionTagHtml } from './contentEditableMentions'

describe('contentEditableMentions', () => {
  it('escapes mention text in both content and metadata', () => {
    expect(getMentionTagHtml('@图<&">')).toBe(
      '<span contenteditable="false" class="mention-tag" data-mention-text="@图&lt;&amp;&quot;&gt;">@图&lt;&amp;&quot;&gt;</span>',
    )
  })
})
