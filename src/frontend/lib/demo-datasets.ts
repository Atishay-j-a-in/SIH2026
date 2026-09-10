export interface DemoDataset {
  id: "1" | "2" | "3";
  label: string;
  videoUrl: string;
  gpsUrl: string;
  modelUrl: string;
  objUrl: string;
  lasUrl?: string;
}

export const DEMO_DATASETS: DemoDataset[] = [
  {
    id: "1",
    label: "Capture 01",
    videoUrl: "/1/sample_1.mp4",
    gpsUrl: "/1/GPS_input.json",
    modelUrl: "/1/model%20(4).ply",
    objUrl: "/1/model%20(4).obj",
  },
  {
    id: "2",
    label: "Capture 02",
    videoUrl: "/2/sample_test2.mp4",
    gpsUrl: "/2/GPS_input.json",
    modelUrl: "/2/model%20(3).ply",
    objUrl: "/2/model%20(3).obj",
    lasUrl: "/2/model%20(3).las",
  },
  {
    id: "3",
    label: "Capture 03",
    videoUrl: "/3/sample_test.mp4",
    gpsUrl: "/3/GPS_input.json",
    modelUrl: "/3/model%20(6).ply",
    objUrl: "/3/model%20(4).obj",
  },
];

export function getDemoDataset(id: string): DemoDataset {
  return DEMO_DATASETS.find((dataset) => dataset.id === id) || DEMO_DATASETS[0];
}
