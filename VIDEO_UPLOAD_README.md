# Video Upload with Mux Integration

This feature provides video upload functionality for the LMS platform using Mux for video processing and streaming.

## Features

- **Multi-Quality Streaming**: Automatic transcoding to multiple resolutions
- **HLS Streaming**: Industry-standard adaptive bitrate streaming
- **Thumbnails**: Automatic thumbnail generation
- **Processing Status**: Real-time video processing updates
- **Webhook Integration**: Automatic status updates from Mux

## API Endpoints

### Upload Video
```http
POST /api/videos/upload/:chapterId
Content-Type: multipart/form-data

Body: video file
```

### Get Video Status
```http
GET /api/videos/status/:chapterId
```

### Delete Video
```http
DELETE /api/videos/:chapterId
```

## Database Schema Updates

The Chapter model now includes Mux-related fields:

```prisma
model Chapter {
  // ... existing fields
  videoUrl      String?   // HLS streaming URL
  muxAssetId    String?   // Mux asset ID
  muxPlaybackId String?   // Mux playback ID
  videoStatus   String?   @default("pending") // pending, processing, ready, error
  // ... other fields
}
```

## Video Status Flow

1. **pending** - No video uploaded
2. **processing** - Video uploaded to Mux, being processed
3. **ready** - Video processed and available for streaming
4. **error** - Processing failed

## Streaming URLs

When video is ready, you get:
- **HLS Stream**: `https://stream.mux.com/{playbackId}.m3u8`
- **Thumbnail**: `https://image.mux.com/{playbackId}/thumbnail.png`
- **Animated GIF**: `https://image.mux.com/{playbackId}/animated.gif`

## Setup Requirements

1. Mux account and API credentials
2. Environment variables configured
3. Webhook endpoint configured (optional)
4. Database migration run

## File Upload Limits

- Maximum file size: 500MB
- Supported formats: MP4, MOV, AVI, MKV, WebM
- Automatic cleanup of temporary files

## Error Handling

- File validation before upload
- Mux API error handling
- Automatic cleanup on failures
- Status tracking and recovery
