# ROS View

Web-based visualization and control interface for portable handheld ROS scanners.

## Purpose

This application provides real-time visualization of point cloud data from portable handheld scanning systems and manages ROS bag recording and node operations.

## Features

### Point Cloud Viewer

- Real-time 3D point cloud visualization using Three.js
- Point decay system with configurable time limits
- Latest scan highlighting (brighter or brighter-red modes)
- Dynamic point scaling based on camera distance
- Field of view adjustment

### Camera Controls

- Follow mode: Camera automatically follows TF frame (e.g., "body" frame)
- Angle lock: Locks camera rotation while following
- Manual orbit controls when follow mode is disabled
- Configurable smoothing for camera movement (0-100+)

### TF Visualization

- Displays coordinate frames as RGB arrows (X=red, Y=green, Z=blue)
- Alternative 3D model visualization (GLB format)
- Configurable arrow size and smoothing
- Independent TF smoothing separate from camera smoothing

### Recording

Video recording:
- H.264 or VP9 codec support
- Configurable frame rate (15, 24, 30, 60 fps)
- Bitrate control
- Automatic segmentation for large recordings

PNG sequence recording:
- JPEG or PNG format export
- Quality control for JPEG
- Frame-by-frame capture
- ZIP archive download

### ROS Integration

- Foxglove WebSocket ROS communication
- Point cloud topic subscription
- TF topic subscription
- Camera image feed
- System statistics monitoring

### Node Management

- View running ROS nodes
- Start and stop nodes via service calls
- Launch predefined node configurations
- Exclude nodes from management interface

### Rosbag Recording

- Start/stop rosbag recording via service calls
- Monitor recording status
- View and delete existing recordings
- Configurable topic list for recording

### Settings

- Connection configuration (WebSocket URL)
- Point cloud settings (decay time, point size, max points)
- Camera settings (FOV, follow frame, smoothing)
- TF settings (arrow size, smoothing, follow configuration)
- Recording settings (mode, codec, bitrate, FPS)
- Node management configuration
- Rosbag recording configuration

All settings persist in browser local storage.

## Configuration

Application configuration is stored in `config/app-config.json`:

- Connection URL
- Default topic names
- Point cloud parameters
- TF frame settings
- Node launch configurations
- Recording parameters

## Build

Development:
```
npm install
npm run dev
```

Production:
```
npm run build
npm start
```

Docker:
```
docker build -t ros-view:latest .
docker run -p 3000:3000 ros-view:latest
```

## Requirements

- Node.js 20+
- ROS system with Foxglove WebSocket bridge
- Modern browser with WebGL support
- For video recording: Browser with WebCodecs API support
