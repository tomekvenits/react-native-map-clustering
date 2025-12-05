import React, {
  memo,
  useState,
  useEffect,
  useMemo,
  useRef,
  forwardRef,
} from "react";
import { Dimensions, LayoutAnimation, Platform } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import SuperCluster from "supercluster";
import ClusterMarker from "./ClusteredMarker";
import {
  isMarker,
  markerToGeoJSONFeature,
  calculateBBox,
  returnMapZoom,
  generateSpiral,
  getClusterColor,
} from "./helpers";

const ClusteredMapView = forwardRef(
  (
    {
      radius = Dimensions.get("window").width * 0.06,
      maxZoom = 20,
      minZoom = 1,
      minPoints = 2,
      extent = 512,
      nodeSize = 64,
      edgePadding = { top: 50, left: 50, right: 50, bottom: 50 },
      children,
      onClusterPress = () => {},
      onRegionChangeComplete = () => {},
      onMarkersChange = () => {},
      preserveClusterPressBehavior = false,
      clusteringEnabled = true,
      clusterColor = "#00B386",
      clusterTextColor = "#FFFFFF",
      clusterFontFamily,
      spiderLineColor = "#FF0000",
      layoutAnimationConf = LayoutAnimation.Presets.spring,
      animationEnabled = true,
      renderCluster,
      tracksViewChanges = false,
      spiralEnabled = true,
      superClusterRef = {},
      mapRef: mapRefProp = () => {},
      colors = ['#FF0000', '#00FF00', '#0000FF'],
      ...restProps
    },
    ref
  ) => {
    const [markers, updateMarkers] = useState([]);
    const [spiderMarkers, updateSpiderMarker] = useState([]);
    const [otherChildren, updateChildren] = useState([]);
    const [superCluster, setSuperCluster] = useState(null);
    const [superClustersByGroup, setSuperClustersByGroup] = useState({});
    const [currentRegion, updateRegion] = useState(
      restProps.region || restProps.initialRegion
    );

    const [isSpiderfier, updateSpiderfier] = useState(false);
    const [clusterChildren, updateClusterChildren] = useState(null);
    const mapRef = useRef();

    const propsChildren = useMemo(
      () => React.Children.toArray(children),
      [children]
    );

    useEffect(() => {
      const rawData = [];
      const otherChildren = [];
      const dataByGroup = {};

      if (!clusteringEnabled) {
        updateSpiderMarker([]);
        updateMarkers([]);
        updateChildren(propsChildren);
        setSuperCluster(null);
        setSuperClustersByGroup({});
        return;
      }

      propsChildren.forEach((child, index) => {
        if (isMarker(child)) {
          const feature = markerToGeoJSONFeature(child, index);
          rawData.push(feature);
          
          // Group markers by their group number for separate clustering
          const group = child.props?.identifier;
          if (group !== undefined && group !== null) {
            if (!dataByGroup[group]) {
              dataByGroup[group] = [];
            }
            dataByGroup[group].push(feature);
          } else {
            // Markers without a group go into a default group
            if (!dataByGroup['_default']) {
              dataByGroup['_default'] = [];
            }
            dataByGroup['_default'].push(feature);
          }
        } else {
          otherChildren.push(child);
        }
      });

      // Create main SuperCluster for backward compatibility
      const superCluster = new SuperCluster({
        radius,
        maxZoom,
        minZoom,
        minPoints,
        extent,
        nodeSize,
      });

      superCluster.load(rawData);

      // Create separate SuperCluster instances for each group
      const clustersByGroup = {};
      Object.keys(dataByGroup).forEach((group) => {
        const groupCluster = new SuperCluster({
          radius,
          maxZoom,
          minZoom,
          minPoints,
          extent,
          nodeSize,
        });
        groupCluster.load(dataByGroup[group]);
        clustersByGroup[group] = groupCluster;
      });

      // Only calculate clusters if we have a valid region
      if (currentRegion) {
        const bBox = calculateBBox(currentRegion);
        const zoom = returnMapZoom(currentRegion, bBox, minZoom);
        
        // Get clusters from each group separately
        const allMarkers = [];
        Object.keys(clustersByGroup).forEach((group) => {
          const groupClusters = clustersByGroup[group].getClusters(bBox, zoom);
          // Tag each cluster with its group
          groupClusters.forEach((cluster) => {
            if (cluster.properties.cluster) {
              cluster.properties.group = group === '_default' ? null : Number(group);
            } else {
              // Individual markers also get their group
              cluster.properties.group = group === '_default' ? null : Number(group);
            }
          });
          allMarkers.push(...groupClusters);
        });

        updateMarkers(allMarkers);
      } else {
        // If no region yet, just store the clusters for later
        updateMarkers([]);
      }
      
      updateChildren(otherChildren);
      setSuperCluster(superCluster);
      setSuperClustersByGroup(clustersByGroup);

      superClusterRef.current = superCluster;
    }, [propsChildren, clusteringEnabled, currentRegion]);

    useEffect(() => {
      if (!spiralEnabled) return;

      if (isSpiderfier && markers.length > 0 && Object.keys(superClustersByGroup).length > 0) {
        let allSpiderMarkers = [];
        let spiralChildren = [];
        markers.map((marker, i) => {
          if (marker.properties.cluster) {
            // Find the correct SuperCluster instance based on group
            const clusterGroup = marker.properties?.group;
            let clusterInstance = superCluster;
            
            if (clusterGroup !== undefined && clusterGroup !== null && superClustersByGroup[clusterGroup]) {
              clusterInstance = superClustersByGroup[clusterGroup];
            } else if (clusterGroup === null && superClustersByGroup['_default']) {
              clusterInstance = superClustersByGroup['_default'];
            }
            
            spiralChildren = clusterInstance.getLeaves(
              marker.properties.cluster_id,
              Infinity
            );
          }
          let positions = generateSpiral(marker, spiralChildren, markers, i);
          allSpiderMarkers.push(...positions);
        });

        updateSpiderMarker(allSpiderMarkers);
      } else {
        updateSpiderMarker([]);
      }
    }, [isSpiderfier, markers, superClustersByGroup, superCluster, spiralEnabled]);

    const _onRegionChangeComplete = (region, details) => {
      if (superCluster && region && Object.keys(superClustersByGroup).length > 0) {
        const bBox = calculateBBox(region);
        const zoom = returnMapZoom(region, bBox, minZoom);
        
        // Get clusters from each group separately
        const allMarkers = [];
        Object.keys(superClustersByGroup).forEach((group) => {
          const groupClusters = superClustersByGroup[group].getClusters(bBox, zoom);
          // Tag each cluster with its group
          groupClusters.forEach((cluster) => {
            if (cluster.properties.cluster) {
              cluster.properties.group = group === '_default' ? null : Number(group);
            } else {
              // Individual markers also get their group
              cluster.properties.group = group === '_default' ? null : Number(group);
            }
          });
          allMarkers.push(...groupClusters);
        });
        
        if (animationEnabled && Platform.OS === "ios") {
          LayoutAnimation.configureNext(layoutAnimationConf);
        }
        if (zoom >= 18 && allMarkers.length > 0 && clusterChildren) {
          if (spiralEnabled) updateSpiderfier(true);
        } else {
          if (spiralEnabled) updateSpiderfier(false);
        }
        updateMarkers(allMarkers);
        onMarkersChange(allMarkers);
        onRegionChangeComplete &&
          onRegionChangeComplete(region, details, allMarkers);
        updateRegion(region);
      } else if (superCluster && region) {
        // Fallback to original behavior if no group-based clustering
        const bBox = calculateBBox(region);
        const zoom = returnMapZoom(region, bBox, minZoom);
        const markers = superCluster.getClusters(bBox, zoom);
        if (animationEnabled && Platform.OS === "ios") {
          LayoutAnimation.configureNext(layoutAnimationConf);
        }
        if (zoom >= 18 && markers.length > 0 && clusterChildren) {
          if (spiralEnabled) updateSpiderfier(true);
        } else {
          if (spiralEnabled) updateSpiderfier(false);
        }
        updateMarkers(markers);
        onMarkersChange(markers);
        onRegionChangeComplete &&
          onRegionChangeComplete(region, details, markers);
        updateRegion(region);
      } else {
        onRegionChangeComplete && onRegionChangeComplete(region, details);
      }
    };

    const _onClusterPress = (cluster) => () => {
      // Find the correct SuperCluster instance based on group
      const clusterGroup = cluster.properties?.group;
      let clusterInstance = superCluster;
      
      if (clusterGroup !== undefined && clusterGroup !== null && superClustersByGroup[clusterGroup]) {
        clusterInstance = superClustersByGroup[clusterGroup];
      } else if (clusterGroup === null && superClustersByGroup['_default']) {
        clusterInstance = superClustersByGroup['_default'];
      }
      
      const children = clusterInstance.getLeaves(cluster.id, Infinity);
      updateClusterChildren(children);

      if (preserveClusterPressBehavior) {
        onClusterPress(cluster, children);
        return;
      }

      const coordinates = children.map(({ geometry }) => ({
        latitude: geometry.coordinates[1],
        longitude: geometry.coordinates[0],
      }));

      mapRef.current.fitToCoordinates(coordinates, { edgePadding });

      onClusterPress(cluster, children);
    };

    return (
      <MapView
        {...restProps}
        ref={(map) => {
          mapRef.current = map;
          if (ref) ref.current = map;
          mapRefProp(map);
        }}
        onRegionChangeComplete={_onRegionChangeComplete}
      >
        {markers.map((marker) =>
          marker.properties.point_count === 0 ? (
            propsChildren[marker.properties.index]
          ) : !isSpiderfier ? (
            renderCluster ? (
              renderCluster({
                onPress: _onClusterPress(marker),
                clusterColor: getClusterColor(
                  marker,
                  superCluster,
                  colors,
                  clusterColor
                ),
                clusterTextColor,
                clusterFontFamily,
                ...marker,
              })
            ) : (
              <ClusterMarker
                key={`cluster-${marker.id}`}
                {...marker}
                onPress={_onClusterPress(marker)}
                clusterColor={
                  restProps.selectedClusterId === marker.id
                    ? restProps.selectedClusterColor
                    : getClusterColor(
                        marker,
                        superCluster,
                        colors,
                        clusterColor
                      )
                }
                clusterTextColor={clusterTextColor}
                clusterFontFamily={clusterFontFamily}
                tracksViewChanges={tracksViewChanges}
              />
            )
          ) : null
        )}
        {otherChildren}
        {spiderMarkers.map((marker) => {
          return propsChildren[marker.index]
            ? React.cloneElement(propsChildren[marker.index], {
                coordinate: { ...marker },
              })
            : null;
        })}
        {spiderMarkers.map((marker, index) => (
          <Polyline
            key={index}
            coordinates={[marker.centerPoint, marker, marker.centerPoint]}
            strokeColor={spiderLineColor}
            strokeWidth={1}
          />
        ))}
      </MapView>
    );
  }
);

export default memo(ClusteredMapView);
