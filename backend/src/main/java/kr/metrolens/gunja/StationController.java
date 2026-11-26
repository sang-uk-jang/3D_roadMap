package kr.metrolens.gunja;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.PriorityQueue;
import java.util.stream.Collectors;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/stations/gunja")
public class StationController {
    private final Graph graph;
    private final Map<String, Node> nodes;
    private final Map<String, List<Edge>> adjacency;

    public StationController(ObjectMapper mapper) throws IOException {
        try (var input = new ClassPathResource("navigation.json").getInputStream()) {
            graph = mapper.readValue(input, Graph.class);
        }
        nodes = graph.nodes().stream().collect(Collectors.toUnmodifiableMap(Node::id, node -> node));
        var edges = new HashMap<String, List<Edge>>();
        nodes.keySet().forEach(id -> edges.put(id, new ArrayList<>()));
        for (var edge : graph.edges()) {
            if ("diagram-model".equals(edge.status())) {
                edges.get(edge.from()).add(edge);
                edges.get(edge.to()).add(edge.reverse());
            }
        }
        adjacency = Map.copyOf(edges);
    }

    @GetMapping
    public Map<String, ?> station() {
        return Map.of("stationId", graph.stationId(), "name", "군자역", "english", "Gunja Station",
                      "lines", List.of(5, 7), "scaleStatus", graph.scaleStatus(),
                      "modelUrl", "/gunja-guide.glb", "routeApi", "/api/stations/gunja/routes");
    }

    @GetMapping("/floors")
    public Map<String, Double> floors() {
        return graph.floors();
    }

    @GetMapping("/facilities")
    public List<Place> facilities() {
        return graph.places();
    }

    @GetMapping("/navigation")
    public Graph navigation() {
        return graph;
    }

    @PostMapping("/routes")
    public Route route(@RequestBody RouteRequest request) {
        String start = request.startNodeId();
        String end = request.endNodeId();
        if (start == null || end == null || start.isBlank() || end.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a start and destination");
        }
        if (!nodes.containsKey(start) || !nodes.containsKey(end)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown route node");
        }
        if (start.equals(end)) {
            return new Route(List.of(start), List.of(nodes.get(start).position()), List.of(), "diagram-model");
        }
        var costs = new HashMap<String, Double>();
        var previous = new HashMap<String, Edge>();
        var queue = new PriorityQueue<>(Comparator.comparingDouble(Visit::cost));
        costs.put(start, 0.0);
        queue.add(new Visit(start, 0.0));
        while (!queue.isEmpty()) {
            var current = queue.remove();
            if (current.cost() > costs.get(current.node())) continue;
            if (current.node().equals(end)) break;
            for (var next : adjacency.get(current.node())) {
                if (request.accessibleOnly() && !"walk".equals(next.kind())) continue;
                double cost = current.cost() + next.cost();
                if (cost < costs.getOrDefault(next.to(), Double.POSITIVE_INFINITY)) {
                    costs.put(next.to(), cost);
                    previous.put(next.to(), next);
                    queue.add(new Visit(next.to(), cost));
                }
            }
        }
        if (!previous.containsKey(end)) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "No route for these nodes");
        }
        var segments = new ArrayDeque<Edge>();
        for (String id = end; !id.equals(start); ) {
            var edge = previous.get(id);
            segments.addFirst(edge);
            id = edge.from();
        }
        var nodeIds = new ArrayList<String>();
        var polyline = new ArrayList<List<Double>>();
        nodeIds.add(start);
        polyline.add(nodes.get(start).position());
        for (var edge : segments) {
            nodeIds.add(edge.to());
            polyline.addAll(edge.geometry().subList(1, edge.geometry().size()));
        }
        return new Route(nodeIds, polyline, List.copyOf(segments), "diagram-model");
    }

    public record Graph(String stationId, String scaleStatus, String upAxis, Map<String, Double> floors,
                        List<Node> nodes, List<Edge> edges, List<Place> places) {}
    public record Node(String id, String floorId, List<Double> position) {}
    public record Place(String id, String floorId, String name, String english, String group, String landmark) {}
    public record Edge(String from, String to, List<List<Double>> geometry, double cost, String kind,
                       String status, String label, boolean videoAppearance, List<List<Double>> treads) {
        Edge reverse() {
            var points = new ArrayList<>(geometry);
            Collections.reverse(points);
            List<List<Double>> reversedTreads = null;
            if (treads != null) {
                reversedTreads = new ArrayList<>();
                for (int index = treads.size() - 1; index >= 0; index--) {
                    var flight = treads.get(index);
                    if (flight == null) {
                        reversedTreads.add(null);
                        continue;
                    }
                    var samples = new ArrayList<>(flight);
                    Collections.reverse(samples);
                    reversedTreads.add(samples);
                }
            }
            return new Edge(to, from, List.copyOf(points), cost, kind, status, label, videoAppearance, reversedTreads);
        }
    }
    public record RouteRequest(String startNodeId, String endNodeId, boolean accessibleOnly) {}
    public record Route(List<String> nodeIds, List<List<Double>> polyline, List<Edge> segments, String status) {}
    private record Visit(String node, double cost) {}
}
