import { describe, expect, it } from 'vitest'
import { isHeicType, sniffUploadImageType } from '@/lib/upload-image'

describe('sniffUploadImageType', () => {
  it('keeps a declared still-image type', () => {
    expect(sniffUploadImageType({ type: 'image/png', name: 'shot.heic' })).toBe('image/png')
    expect(sniffUploadImageType({ type: 'image/jpeg', name: 'a.jpg' })).toBe('image/jpeg')
  })

  it('fills in an empty or octet-stream type from the filename, including HEIC', () => {
    expect(sniffUploadImageType({ type: '', name: 'IMG_0001.PNG' })).toBe('image/png')
    expect(sniffUploadImageType({ type: 'application/octet-stream', name: 'shot.jpg' })).toBe('image/jpeg')
    expect(sniffUploadImageType({ type: '', name: 'IMG_0001.HEIC' })).toBe('image/heic')
    expect(isHeicType('image/heic')).toBe(true)
    expect(isHeicType('image/png')).toBe(false)
  })

  it('does not invent a type for an unknown name', () => {
    expect(sniffUploadImageType({ type: '', name: 'notes.txt' })).toBe('')
  })
})
