# Configuration Guide

This document describes all configuration options available in `config/app-config.json`.

## Connection

WebSocket connection settings for ROS communication.

### url
- Type: `string`
- Example: `"ws://192.168.1.160:8765"`
- Description: WebSocket URL for ROS bridge connection. Must use `ws://` protocol (or `wss://` for secure connections).

## Point Cloud

Settings for point cloud visualization.

### topic
- Type: `string`
- Example: `"/cloud_registered"`
- Description: ROS topic name for point cloud messages.

### decayTimeSeconds
- Type: `number`
- Example: `10`
- Description: Time in seconds before points fade out and are removed from the view. Set to `0` for infinite persistence.

### maxPoints
- Type: `number`
- Example: `0`
- Description: Maximum number of points to render. Set to `0` for unlimited. Use for performance control on lower-end hardware.

### pointSize
- Type: `number`
- Example: `0.1`
- Description: Size of accumulated point cloud points in viewport units.

### latestScanPointSize
- Type: `number`
- Example: `2.5`
- Description: Size of the most recent scan points in viewport units. Typically larger than `pointSize` for emphasis.

### latestScanMode
- Type: `string`
- Options: `"brighter"` or `"brighter-red"`
- Example: `"brighter-red"`
- Description: How to highlight the latest scan. `"brighter"` increases intensity, `"brighter-red"` makes points brighter and red-tinted.

### fov
- Type: `number`
- Example: `120`
- Description: Camera field of view in degrees. Higher values provide wider view but more distortion.

### dynamicLatestPointScaling
- Type: `boolean`
- Example: `true`
- Description: Automatically scale latest scan point size based on camera distance. Keeps points visually consistent as camera moves.

## Camera

Camera feed settings.

### topic
- Type: `string`
- Example: `"/usb_cam/image_raw"`
- Description: ROS topic name for camera image messages.

## Stats

System statistics monitoring.

### topic
- Type: `string`
- Example: `"/supervisor/monitor/system"`
- Description: ROS topic name for system statistics messages (CPU, memory, disk usage).

## TF

Transform frame visualization and camera following.

### topic
- Type: `string`
- Example: `"/tf"`
- Description: ROS topic name for TF transform messages.

### enabled
- Type: `boolean`
- Example: `true`
- Description: Enable or disable TF frame visualization on startup.

### arrowLength
- Type: `number`
- Example: `0.2`
- Description: Length of coordinate frame arrows in meters.

### arrowWidth
- Type: `number`
- Example: `0.02`
- Description: Width of coordinate frame arrows. Note: Line width rendering is limited in WebGL.

### smoothing
- Type: `number`
- Range: `0` to `100+`
- Example: `0`
- Description: Smoothing factor for TF frame movement. `0` = instant/no smoothing, `5-10` = light, `20-30` = medium, `50+` = heavy. Higher values add more delay.

### follow.frameId
- Type: `string`
- Example: `"body"`
- Description: Which TF frame the camera should follow when follow mode is enabled.

### follow.smoothing
- Type: `number`
- Range: `0` to `100+`
- Example: `0`
- Description: Smoothing factor for camera follow movement. Independent from TF smoothing. `0` = instant tracking, higher values = smoother but delayed camera movement.

## Nodes

ROS node management configuration.

### topic
- Type: `string`
- Example: `"/supervisor/monitor/nodes"`
- Description: ROS topic name for node status monitoring.

### startService
- Type: `string`
- Example: `"/supervisor/actions/start_node"`
- Description: ROS service name for starting nodes.

### stopService
- Type: `string`
- Example: `"/supervisor/actions/stop_node"`
- Description: ROS service name for stopping nodes.

### exclude
- Type: `array of strings`
- Example: `["/rosout", "/foxglove_nodelet_manager"]`
- Description: List of node names to exclude from the management interface.

### launch
- Type: `array of objects`
- Description: Predefined launch configurations for starting node groups.

#### launch[].package
- Type: `string`
- Example: `"fast_lio"`
- Description: ROS package name.

#### launch[].launchFile
- Type: `string`
- Example: `"mapping_ouster64_jetson.launch"`
- Description: Launch file name within the package.

#### launch[].args
- Type: `array of objects`
- Description: Launch file arguments.

#### launch[].args[].key
- Type: `string`
- Example: `"rviz"`
- Description: Argument name.

#### launch[].args[].value
- Type: `string`
- Example: `"false"`
- Description: Argument value.

## Recorder

Rosbag recording configuration.

### topic
- Type: `string`
- Example: `"/supervisor/monitor/records"`
- Description: ROS topic name for monitoring available recordings.

### statusTopic
- Type: `string`
- Example: `"/supervisor/monitor/recording"`
- Description: ROS topic name for current recording status.

### deleteService
- Type: `string`
- Example: `"/supervisor/actions/delete_recording"`
- Description: ROS service name for deleting recordings.

### startService
- Type: `string`
- Example: `"/supervisor/actions/start_recording"`
- Description: ROS service name for starting rosbag recording.

### stopService
- Type: `string`
- Example: `"/supervisor/actions/stop_recording"`
- Description: ROS service name for stopping rosbag recording.

### topics
- Type: `array of strings`
- Example: `["/ouster/points", "/ouster/imu"]`
- Description: List of ROS topics to record in the rosbag.

## Recording

Screen/viewport recording settings for video and image sequence capture.

### mode
- Type: `string`
- Options: `"video"` or `"png-sequence"`
- Example: `"video"`
- Description: Recording output format. `"video"` creates MP4 files, `"png-sequence"` creates ZIP archives of images.

### fps
- Type: `number`
- Options: `15`, `24`, `30`, `60`
- Example: `30`
- Description: Frame rate for capture in frames per second.

### codec (video mode only)
- Type: `string`
- Options: `"h264"` or `"vp9"`
- Example: `"h264"`
- Description: Video codec. H.264 is faster and more compatible, VP9 provides better quality at same bitrate.

### bitrate (video mode only)
- Type: `number`
- Example: `100`
- Description: Video bitrate in megabits per second (Mbps). Higher values = better quality but larger files.

### format (png-sequence mode only)
- Type: `string`
- Options: `"jpeg"` or `"png"`
- Example: `"png"`
- Description: Image format for sequence recording. JPEG is faster and smaller (lossy), PNG is slower but lossless.

### quality (png-sequence mode only)
- Type: `number`
- Range: `0.0` to `1.0`
- Example: `1.0`
- Description: JPEG quality factor. `1.0` = maximum quality, lower values = more compression. Ignored for PNG format.

## Configuration Priority

Settings are loaded in the following order (later sources override earlier ones):

1. Default values from `config/app-config.json`
2. Browser local storage (persisted user changes)
3. Runtime changes via Settings UI

## Notes

- All settings can be modified at runtime through the Settings UI
- Changes made in the Settings UI are persisted to browser local storage
- To reset to defaults, clear browser local storage or reset individual settings in the UI
- Some settings require reconnection to ROS bridge to take effect
- Frame rates above 30 fps may impact performance on lower-end hardware
- Video recording requires browser support for WebCodecs API (Chrome/Edge recommended)
