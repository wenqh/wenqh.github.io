import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.util.Arrays;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public class TvCrawler {
    private static Stream<String> M3U8_URLS = Stream.of(
            "https://bc.188766.xyz/?ip=&mishitong=true&mima=mianfeibuhuaqian&json=true",
            "https://gh.llkk.cc/https://raw.githubusercontent.com/develop202/migu_video/refs/heads/main/interface.txt",
            "https://nos.netease.com/ysf/3d75a78a0fc7ede372c03598d6d10367.m3u",
            "https://sub.ottiptv.cc/huyayqk.m3u",
            "https://sub.ottiptv.cc/douyuyqk.m3u",
            "https://sub.ottiptv.cc/bililive.m3u",
            "https://sub.ottiptv.cc/yylunbo.m3u",
            "https://wenqh.github.io/tv1.m3u"
    );

    public static void main(String[] args) throws IOException {
        String all = M3U8_URLS.map(u -> {
            String resp = httpGet(u);
            return resp;
        }).collect(Collectors.joining("\n"));

        Files.writeString(Paths.get("tv-auto.m3u"), all, StandardCharsets.UTF_8);
    }


    private static String httpGet(String url) {
        HttpClient httpClient = HttpClient.newHttpClient();
        // 构造 GET 请求
        HttpRequest request = HttpRequest.newBuilder().uri(URI.create(url)).GET()
                .header("User-Agent", "okhttp/5.1.0").build();

        HttpResponse<String> response;
        try {
            response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (IOException | InterruptedException e) {
            throw new RuntimeException(e);
        }

        return response.body();
    }
}


