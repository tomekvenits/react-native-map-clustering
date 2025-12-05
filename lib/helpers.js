import GeoViewport from "@mapbox/geo-viewport";
import { Dimensions } from "react-native";

const { width, height } = Dimensions.get("window");

export const isMarker = (child) =>
  child &&
  child.props &&
  child.props.coordinate &&
  child.props.cluster !== false;

export const calculateBBox = (region) => {
  let lngD;
  if (region.longitudeDelta < 0) lngD = region.longitudeDelta + 360;
  else lngD = region.longitudeDelta;

  return [
    region.longitude - lngD, // westLng - min lng
    region.latitude - region.latitudeDelta, // southLat - min lat
    region.longitude + lngD, // eastLng - max lng
    region.latitude + region.latitudeDelta, // northLat - max lat
  ];
};

export const returnMapZoom = (region, bBox, minZoom) => {
  const viewport =
    region.longitudeDelta >= 40
      ? { zoom: minZoom }
      : GeoViewport.viewport(bBox, [width, height]);

  return viewport.zoom;
};

export const markerToGeoJSONFeature = (marker, index) => {
  return {
    type: "Feature",
    geometry: {
      coordinates: [
        marker.props.coordinate.longitude,
        marker.props.coordinate.latitude,
      ],
      type: "Point",
    },
    properties: {
      point_count: 0,
      index,
      ..._removeChildrenFromProps(marker.props),
    },
  };
};

export const generateSpiral = (marker, clusterChildren, markers, index) => {
  const { properties, geometry } = marker;
  const count = properties.point_count;
  const centerLocation = geometry.coordinates;

  let res = [];
  let angle = 0;
  let start = 0;

  for (let i = 0; i < index; i++) {
    start += markers[i].properties.point_count || 0;
  }

  for (let i = 0; i < count; i++) {
    angle = 0.25 * (i * 0.5);
    let latitude = centerLocation[1] + 0.0002 * angle * Math.cos(angle);
    let longitude = centerLocation[0] + 0.0002 * angle * Math.sin(angle);

    if (clusterChildren[i + start]) {
      res.push({
        index: clusterChildren[i + start].properties.index,
        longitude,
        latitude,
        centerPoint: {
          latitude: centerLocation[1],
          longitude: centerLocation[0],
        },
      });
    }
  }

  return res;
};

export const returnMarkerStyle = (points) => {
  if (points >= 50) {
    return {
      width: 84,
      height: 84,
      size: 64,
      fontSize: 20,
    };
  }

  if (points >= 25) {
    return {
      width: 78,
      height: 78,
      size: 58,
      fontSize: 19,
    };
  }

  if (points >= 15) {
    return {
      width: 72,
      height: 72,
      size: 54,
      fontSize: 18,
    };
  }

  if (points >= 10) {
    return {
      width: 66,
      height: 66,
      size: 50,
      fontSize: 17,
    };
  }

  if (points >= 8) {
    return {
      width: 60,
      height: 60,
      size: 46,
      fontSize: 17,
    };
  }

  if (points >= 4) {
    return {
      width: 54,
      height: 54,
      size: 40,
      fontSize: 16,
    };
  }

  return {
    width: 48,
    height: 48,
    size: 36,
    fontSize: 15,
  };
};

const _removeChildrenFromProps = (props) => {
  const newProps = {};
  Object.keys(props).forEach((key) => {
    if (key !== "children") {
      newProps[key] = props[key];
    }
  });
  return newProps;
};

/**
 * Determines the color for a cluster based on the group of the cluster
 * Since clusters are now separated by group, we can directly use the cluster's group
 * @param {Object} cluster - The cluster object from SuperCluster
 * @param {Object} superCluster - The SuperCluster instance (kept for backward compatibility)
 * @param {Array|Object} colors - Array or object mapping group numbers to colors
 * @param {string} defaultColor - Default color if no group color is found
 * @returns {string} The color to use for the cluster
 */
export const getClusterColor = (cluster, superCluster, colors, defaultColor) => {
  if (!colors) {
    return defaultColor;
  }

  try {
    // Since clusters are now separated by group, we can directly use the cluster's group property
    const group = cluster.properties?.group;
    
    if (group !== undefined && group !== null) {
      if (Array.isArray(colors)) {
        return colors[Number(group)] || defaultColor;
      } else if (typeof colors === 'object') {
        return colors[Number(group)] || defaultColor;
      }
    }
    
    // Fallback: if no group property, try to determine from cluster contents (backward compatibility)
    if (cluster.properties.cluster && superCluster) {
      const leaves = superCluster.getLeaves(cluster.id, Infinity);
      
      if (leaves && leaves.length > 0) {
        // Count groups in the cluster
        const groupCounts = {};
        leaves.forEach((leaf) => {
          const leafGroup = leaf.properties?.group;
          if (leafGroup !== undefined && leafGroup !== null) {
            groupCounts[leafGroup] = (groupCounts[leafGroup] || 0) + 1;
          }
        });

        // Find the most common group
        let dominantGroup = null;
        let maxCount = 0;
        Object.keys(groupCounts).forEach((g) => {
          if (groupCounts[g] > maxCount) {
            maxCount = groupCounts[g];
            dominantGroup = Number(g);
          }
        });

        // Return color based on group
        if (dominantGroup !== null) {
          if (Array.isArray(colors)) {
            return colors[Number(dominantGroup)] || defaultColor;
          } else if (typeof colors === 'object') {
            return colors[Number(dominantGroup)] || defaultColor;
          }
        }
      }
    }
  } catch (error) {
    // If anything goes wrong, return default color
    return defaultColor;
  }

  return defaultColor;
};