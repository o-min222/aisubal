import { describe, it, expect } from 'vitest'
import { videoEmbed } from '../src/lib/video-embed'

describe('videoEmbed (list-card click-to-play)', () => {
  it('youtube → privacy-enhanced player', () => {
    expect(videoEmbed('https://www.youtube.com/watch?v=zjkBMFhNj_g')?.embedUrl).toBe('https://www.youtube-nocookie.com/embed/zjkBMFhNj_g?autoplay=1&rel=0')
    expect(videoEmbed('https://youtu.be/zjkBMFhNj_g')?.provider).toBe('youtube')
  })
  it('vimeo numeric ids only', () => {
    expect(videoEmbed('https://vimeo.com/76979871')?.embedUrl).toBe('https://player.vimeo.com/video/76979871?autoplay=1&dnt=1')
    expect(videoEmbed('https://vimeo.com/channels/staffpicks')).toBeNull()
  })
  it('x / twitter status → official embed', () => {
    expect(videoEmbed('https://x.com/karpathy/status/1886192184808149383')?.embedUrl).toBe('https://platform.twitter.com/embed/Tweet.html?id=1886192184808149383&dnt=true')
    expect(videoEmbed('https://twitter.com/a_b/statuses/123456789')?.provider).toBe('x')
    expect(videoEmbed('https://x.com/karpathy')).toBeNull()
  })
  it('never embeds lookalike hosts or junk', () => {
    expect(videoEmbed('https://youtube.com.evil.test/watch?v=zjkBMFhNj_g')).toBeNull()
    expect(videoEmbed('https://evil.test/x.com/a/status/123456')).toBeNull()
    expect(videoEmbed('not a url')).toBeNull()
  })
})
