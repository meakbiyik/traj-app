import { useState, useCallback, useRef, useEffect } from "react";
import ReactPlayer from "react-player";
import {
  MapContainer,
  TileLayer,
  Marker,
  useMapEvents,
  useMap,
  Polyline,
} from "react-leaflet";
import { useDropzone } from "react-dropzone";
import styled from "styled-components";
import CubicSpline from "typescript-cubic-spline";
import GPMFExtract from "gpmf-extract";
import GoProTelemetry from "gopro-telemetry";
import { confirm, save, open } from "@tauri-apps/api/dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/api/fs";
import L from "leaflet";
import MarkerRed from "/marker-red.svg";
import MarkerGray from "/marker-gray.svg";
import MarkerGreen from "/marker-green.svg";
import MarkerBlue from "/marker-blue.svg";

const Container = styled.div`
  margin: 0;
  padding: 0;
  width: 100vw;
  height: 100vh;

  display: flex;
  flex-direction: row;
`;

const DropZone = styled.div`
  width: 100%;
  height: 100vh;
  background-color: #eee;
  display: flex;
  justify-content: center;
  align-items: center;
`;

const Display = styled.div`
  height: 100%;

  display: flex;
  flex-direction: column;
`;

const Controls = styled.div`
  margin: 10px;

  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
`;

const SaveRequirements = styled.div`
  color: red;
  opacity: 0.5;
  font-size: 0.8em;
`;

const SeekButtons = styled.div`
  display: flex;
  flex-direction: row;
  gap: 10px;
`;

const Instructions = styled.div`
  margin: 10px 0;
  padding: 0 10px;
  border: 1px solid black;
  border-radius: 5px;
`;

const Button = styled.button`
  width: 100%;
  height: 50px;

  &:disabled {
    pointer-events: none;
    opacity: 0.5;
  }
`;

const CloseButton = styled(Button)`
  margin-top: auto;
`;

const AppStateIndicator = styled.div`
  font-weight: bold;
  color: ${(props: { state: AppState }) => {
    switch (props.state) {
      case AppState.IDLE:
        return "black";
      case AppState.VIDEO_LOADING:
        return "orange";
      case AppState.GPS_LOADING:
        return "orange";
      case AppState.READY:
        return "green";
      case AppState.ERROR:
        return "red";
    }
  }};
`;

const VideoWrapper = styled.div`
  height: 50vh;
`;

const MapWrapper = styled.div`
  width: 100%;
  height: 50vh;
`;

const MarkerWrapper = styled.div`
  cursor: none;
`;

enum AppState {
  IDLE,
  VIDEO_LOADING,
  GPS_LOADING,
  READY,
  ERROR,
}

const appStateMessages = {
  [AppState.IDLE]: "Drop a video file here to get started",
  [AppState.VIDEO_LOADING]: "Loading video...",
  [AppState.GPS_LOADING]: "Extracting GPS data...",
  [AppState.READY]: "Ready",
  [AppState.ERROR]: "Error",
};

const RedIcon = new L.Icon({
  iconUrl: MarkerRed,
  iconSize: [10, 10],
  opacity: 1.0,
});

const GrayIcon = new L.Icon({
  iconUrl: MarkerGray,
  iconSize: [10, 10],
  opacity: 1.0,
});

const GreenIcon = new L.Icon({
  iconUrl: MarkerGreen,
  iconSize: [10, 10],
  opacity: 1.0,
});

const BlueIcon = new L.Icon({
  iconUrl: MarkerBlue,
  iconSize: [10, 10],
  opacity: 1.0,
});

const GPSMarker = ({
  id,
  value,
  isOriginal,
  currentCTS,
  acc99Perc,
  moveMarker,
  removeMarker,
  goToCTS,
}: any) => {
  const markerEvents = {
    contextmenu: (e: any) => {
      if (isOriginal) goToCTS(value.cts);
      else removeMarker(id);
    },
    dragend: (e: any) => {
      moveMarker(id, e.target.getLatLng());
    },
  };

  let icon;
  if (isOriginal) {
    if (value.cts <= currentCTS) {
      icon = RedIcon;
    } else {
      icon = GrayIcon;
    }
  } else {
    icon = BlueIcon;
  }

  // clone the icon so that we can change the size and opacity
  icon = L.icon({ ...icon.options });

  if (isOriginal) {
    icon.options.iconSize = [2, 2];
    // adjust the size and opacity according to accelaration (acc)
    // average acc is around 5e-11, max is around 1e-9 and min is 0
    // so we map the range to sizes between 2 and 15
    let size = 5 + (value.acc / acc99Perc) ** 3 * 7;
    // set maximum size to 12
    size = Math.min(size, 12);
    icon.options.iconSize = [size, size];
  } else {
    icon.options.iconSize = [10, 10];
  }

  const position = {
    lng: value.lng,
    lat: value.lat,
  };

  return (
    <MarkerWrapper>
      <Marker
        position={position}
        draggable={!isOriginal}
        icon={icon}
        eventHandlers={markerEvents}
      />
    </MarkerWrapper>
  );
};

const MapContent = ({
  currentCTS,
  gpsData,
  splineData,
  markers,
  createMarker,
}: any) => {
  const map = useMap();
  useMapEvents({
    click: (e: any) => createMarker(e.latlng),
  });

  if (gpsData.length === 0) return null;
  let currentPointGPS = gpsData.find((data: any) => data.cts >= currentCTS);
  if (!currentPointGPS) currentPointGPS = gpsData[gpsData.length - 1];
  map.setView([currentPointGPS.lat, currentPointGPS.lng]);

  return (
    <>
      {splineData && (
        <>
          <Polyline
            pathOptions={{ color: "green" }}
            positions={splineData.map((data: any) => [data.lat, data.lng])}
          />
          {markers.map((data: any) => {
            let closestGPS = gpsData.find(
              (gps: any) => gps.cts >= data.props.value.cts
            );
            if (!closestGPS) closestGPS = gpsData[gpsData.length - 1];
            return (
              <Polyline
                pathOptions={{ color: "blue", dashArray: "10, 10" }}
                positions={[
                  [data.props.value.lat, data.props.value.lng],
                  [closestGPS.lat, closestGPS.lng],
                ]}
              />
            );
          })}
        </>
      )}
      {markers}
    </>
  );
};

const App = () => {
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [gpsData, setGpsData] = useState<
    {
      lat: number;
      lng: number;
      acc?: number;
      cts: number;
    }[]
  >([]);
  const [acc99Perc, setAcc99Perc] = useState<number>(0);
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [currentCTS, setCurrentCTS] = useState<number>(0);
  const [splineData, setSplineData] = useState([]);
  const [markers, setMarkers] = useState<any>([]);
  const playerRef = useRef<any>(null);

  const saveRequirementsAreNotMet = useCallback(() => {
    if (!videoPath) return "No video file selected";
    if (appState !== AppState.READY) return "App is not ready";
    // check if spline data first and last points are close enough in time to the first and last gps points
    if (splineData.length <= 2) return "Not enough datapoints (less than 3 points)";
    const times = splineData.map((data: any) => data.cts);
    const maxSplineCts = Math.max(...times);
    const minSplineCts = Math.min(...times);
    if (
      gpsData[gpsData.length - 1].cts - maxSplineCts > 100 ||
      minSplineCts - gpsData[0].cts > 100
    ) {
      return "New datapoints should cover the whole video, including the first and last GPS points. Seek to the beginning and end of the video and add new markers.";
    }
    return false;
  }, [videoPath, appState, splineData, gpsData]);

  const { getRootProps, getInputProps } = useDropzone({
    onDrop: (acceptedFiles: any) => {
      setVideoPath(acceptedFiles[0].path);
      setVideoUrl(URL.createObjectURL(acceptedFiles[0]));
      extractGpsData(acceptedFiles[0]);
    },
    accept: {
      "video/mp4": [".mp4", ".MP4"],
    },
  });

  const closeVideo = async () => {
    const confirmed = await confirm(
      "Are you sure you want to close the video?",
      "Close Video"
    );
    if (!confirmed) return;
    setVideoUrl(null);
    setVideoPath(null);
    setVideoDuration(0);
    setAcc99Perc(0);
    setGpsData([]);
    setSplineData([]);
    setMarkers([]);
    setAppState(AppState.IDLE);
  };

  const loadMarkersFromCSV = async () => {
    const confirmed = await confirm(
      "Are you sure you want to load markers from a CSV file? This will overwrite any existing markers.",
      "Load Markers"
    );
    if (!confirmed) return;
    open({
      multiple: false,
      filters: [{ name: "CSV", extensions: ["csv"] }],
    }).then(async (selected) => {
      if (!selected) return;
      const file = await readTextFile(selected as string);
      const parsed = file.split("\n").map((line: string) => {
        const [lat, lng, cts] = line.split(",");
        return {
          lat: parseFloat(lat),
          lng: parseFloat(lng),
          cts: parseInt(cts),
        };
      });
      const newMarkers = parsed.map((data: any, id: number) => (
        <GPSMarker
          id={id}
          value={data}
          currentCTS={currentCTS}
          moveMarker={handleMarkerDrag}
          removeMarker={removeMarker}
        />
      ));
      setMarkers(newMarkers);
    });
  };

  const extractGpsData = async (file: any) => {
    setAppState(AppState.VIDEO_LOADING);
    return GPMFExtract(file, {
      browserMode: true,
    })
      .then((extracted) => {
        setAppState(AppState.GPS_LOADING);
        return GoProTelemetry(
          extracted,
          {
            stream: ["GPS"],
          },
          (telemetry: any) => {
            // get the first device
            const streams = telemetry[Object.keys(telemetry)[0]].streams;
            const gpsStream = streams[Object.keys(streams)[0]].samples;
            let gpsData = gpsStream.map((sample: any) => ({
              lat: sample.value[0],
              lng: sample.value[1],
              cts: sample.cts,
            }));
            // subsample every 4th point
            gpsData = gpsData.filter(
              (data: any, i: number) => i % 4 === 0 || i === gpsData.length - 1
            );
            // add absolute acceleration (does not need to be in meters) as "acc" property
            const speeds = gpsData.map((data: any, i: number) => {
              if (i === 0) return 0;
              const prevData = gpsData[i - 1];
              // just estimate the distance as if it was Euclidean
              const distance = Math.sqrt(
                (data.lat - prevData.lat) ** 2 + (data.lng - prevData.lng) ** 2
              );
              const time = data.cts - prevData.cts;
              return distance / time;
            });
            gpsData.forEach((data: any, i: number) => {
              if (i === 0) {
                data.acc = 0;
                return;
              }
              data.acc = Math.abs((speeds[i] - speeds[i - 1])) / (data.cts - gpsData[i - 1].cts);
            });
            // sort the acc and find the 99th percentile
            const sortedAcc = gpsData.map((data: any) => data.acc).sort((a: number, b: number) => a - b);
            const acc99Perc = sortedAcc[Math.floor(sortedAcc.length * 0.99)];
            setAcc99Perc(acc99Perc);
            setGpsData(gpsData);
            setVideoDuration(gpsData[gpsData.length - 1].cts  / 1000);
            setAppState(AppState.READY);
          }
        );
      })
      .catch((err) => {
        console.error(err);
        setAppState(AppState.ERROR);
      });
  };

  const onVideoProgress = useCallback(
    (playedSeconds: number) => {
      setCurrentCTS(playedSeconds * 1000);
    },
    [setCurrentCTS]
  );

  const goToCTS = useCallback(
    (cts: number) => {
      setCurrentCTS(cts);
      if (playerRef.current) {
        playerRef.current.seekTo(cts / 1000, "seconds");
      }
    },
    [setCurrentCTS, playerRef.current]
  );

  const generateSpline = (values: any, targets: any) => {
    // sort values by cts
    values.sort((a: any, b: any) => a.cts - b.cts);
    const { lats, lngs, xs } = values.reduce(
      (acc: any, value: any) => {
        acc.lats.push(value.lat);
        acc.lngs.push(value.lng);
        acc.xs.push(value.cts);
        return acc;
      },
      {
        lats: [],
        lngs: [],
        xs: [],
      }
    );

    const latSpline = new CubicSpline(xs, lats);
    const lngSpline = new CubicSpline(xs, lngs);

    // interpolate for all gps data cts
    const max = Math.max(...xs);
    const min = Math.min(...xs);
    const target_xs = targets.filter((x: number) => {
      return x >= min && x <= max;
    });

    // Generate an array of lat/lng points along the spline
    const splinePoints = target_xs.map((cts: number) => {
      const lat = latSpline.at(cts);
      const lng = lngSpline.at(cts);
      return { lat, lng, cts };
    });

    return splinePoints;
  };

  useEffect(() => {
    if (!markers.length || !gpsData.length) return;
    let splinePoints = [];
    if (markers.length >= 2) {
      splinePoints = generateSpline(
        markers.map((data: any) => data.props.value),
        gpsData.map((data: any) => data.cts)
      );
    }
    setSplineData(splinePoints as any);
  }, [markers, gpsData]);

  const removeMarker = useCallback(
    (id: number) => {
      setMarkers((prevMarkers: any) => {
        const newMarkers = [...prevMarkers];
        newMarkers.splice(id, 1);
        return newMarkers;
      });
    },
    [setMarkers]
  );

  const handleMarkerDrag = useCallback(
    (id: number, position: any) => {
      setMarkers((prevMarkers: any) => {
        const newMarkers = [...prevMarkers];
        const value = {
          lat: position.lat,
          lng: position.lng,
          cts: newMarkers[id].props.value.cts,
        };
        newMarkers[id] = (
          <GPSMarker
            id={id}
            value={value}
            currentCTS={currentCTS}
            moveMarker={handleMarkerDrag}
            removeMarker={removeMarker}
          />
        );
        return newMarkers;
      });
    },
    [markers, currentCTS, setMarkers]
  );

  const createMarker = useCallback(
    (position: any) => {
      const value = {
        lat: position.lat,
        lng: position.lng,
        cts: currentCTS,
      };
      const idx = markers.findIndex(
        (data: any) => data.props.value.cts === currentCTS
      );
      const id = idx !== -1 ? idx : markers.length;
      const newMarker = (
        <GPSMarker
          id={id}
          value={value}
          currentCTS={currentCTS}
          moveMarker={handleMarkerDrag}
          removeMarker={removeMarker}
        />
      );
      const newMarkers = [...markers];
      newMarkers[id] = newMarker;
      setMarkers(newMarkers);
    },
    [markers, currentCTS, setMarkers, handleMarkerDrag, removeMarker]
  );

  const saveData = () => {
    // save data to the same video path except with .csv extension
    if (!videoPath) return;
    const csvPath = videoPath.replace(/\.[^/.]+$/, ".csv");
    const csvData = markers.map((marker: any) => {
      const data = marker.props.value;
      return `${data.lat},${data.lng},${data.cts}`;
    });
    const csvContent = csvData.join("\n");
    // save with dialog
    save({
      title: "Save GPS data",
      defaultPath: csvPath,
      filters: [{ name: "CSV", extensions: ["csv"] }],
    })
      .then((result: any) => {
        writeTextFile(result, csvContent);
      })
      .catch((err: any) => {
        console.error(err);
      });
  };

  return (
    <Container>
      {!videoUrl && (
        <DropZone {...getRootProps()}>
          <input {...getInputProps()} />
          <p>Click to select file</p>
        </DropZone>
      )}
      {videoUrl && (
        <>
          <Display>
            <VideoWrapper>
              <ReactPlayer
                ref={playerRef}
                url={videoUrl}
                onProgress={({ playedSeconds }) =>
                  onVideoProgress(playedSeconds)
                }
                progressInterval={100}
                width="50vw"
                height="100%"
                controls
              />
            </VideoWrapper>
            <MapWrapper>
              <MapContainer
                center={{ lat: 46.947974, lng: 7.447447 }}
                zoom={18}
                scrollWheelZoom={false}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
                  maxNativeZoom={19}
                  maxZoom={21}
                />
                {gpsData.map((value, i) => (
                  <GPSMarker
                    key={i}
                    id={i}
                    value={value}
                    isOriginal
                    acc99Perc={acc99Perc}
                    currentCTS={currentCTS}
                    goToCTS={goToCTS}
                  />
                ))}
                <MapContent
                  currentCTS={currentCTS}
                  gpsData={gpsData}
                  splineData={splineData}
                  markers={markers}
                  createMarker={createMarker}
                />
              </MapContainer>
            </MapWrapper>
          </Display>
          <Controls>
            <AppStateIndicator state={appState}>
              {appStateMessages[appState]}
            </AppStateIndicator>
            <Button onClick={saveData} disabled={!!saveRequirementsAreNotMet()}>
              Save Data
            </Button>
            {!!saveRequirementsAreNotMet() && (
              <SaveRequirements>
                {saveRequirementsAreNotMet()}
              </SaveRequirements>
            )}
            <SeekButtons>
              <Button onClick={() => goToCTS(0)} disabled={appState !== AppState.READY}>
                Seek to start
              </Button>
              <Button onClick={() => goToCTS(videoDuration * 1000)} disabled={appState !== AppState.READY}>
                Seek to end
              </Button>
              <Button onClick={loadMarkersFromCSV} disabled={appState !== AppState.READY}>
                Load data from file
              </Button>
            </SeekButtons>
            <Instructions>
              <p>
                1. Wait until the GPS points are rendered and the app state is{" "}
                <b style={{ color: "green" }}>Ready</b>.
              </p>
              <p>
                2. <b style={{ color: "gray" }}>Gray</b> and <b style={{ color: "red" }}>Red</b> markers are the original,
                noisy GPS points. <b style={{ color: "red" }}>Red</b> markers represent points before the current video frame.
                The size of the markers represent absolute speed change. <b>Add more markers around these points.</b>
              </p>
              <p>3. Right-click on a <b style={{ color: "gray" }}>Gray</b> marker to go to that video frame.</p>
              <p>
                4. Click on the map to add a{" "}
                <b style={{ color: "blue" }}>Blue</b> marker for the current
                video frame.
              </p>
              <p>
                5. Dashed <b style={{ color: "blue" }}>Blue</b> lines connect
                markers that are from the same frame. Ideally, these lines
                should be short!
              </p>
              <p>
                6. Drag a <b style={{ color: "blue" }}>Blue</b> marker to move
                it. Right-click on a <b style={{ color: "blue" }}>Blue</b> marker
                to remove it.
              </p>
              <p>
                8. After adding enough markers, click <b>Save Data</b> to save
                the <b style={{ color: "green" }}>Green</b> line to a CSV file.
              </p>
            </Instructions>
            <CloseButton onClick={closeVideo}>Close Video</CloseButton>
          </Controls>
        </>
      )}
    </Container>
  );
};

export default App;
